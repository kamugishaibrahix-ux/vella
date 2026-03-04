/**
 * Production-grade rate limiting with store abstraction.
 * - Development: in-memory store when Redis URL is unset.
 * - Production: Redis required (ADMIN_REDIS_URL or REDIS_URL); throws on boot if missing.
 *
 * Key shape unchanged: admin:${userId}:${routeName} or admin:ip:${ip}:${routeName}; ip:auth:login:${ip}.
 */
import type { RateLimitStore } from "./rateLimit/store";
import { MemoryRateLimitStore } from "./rateLimit/memoryStore";
import type { ObservabilityMeta } from "./observability";
import { incrementRateLimited, logSecurityEvent } from "./observability";

export const RATE_LIMIT_ERROR_NAME = "RateLimitError";

export const RATE_LIMITED_RESPONSE = {
  code: "RATE_LIMITED" as const,
  message: "Too many requests. Please try again later.",
};

export interface RateLimitError extends Error {
  name: "RateLimitError";
  retryAfterSeconds?: number;
}

export function rateLimit429Response(
  retryAfterSeconds?: number,
  meta?: ObservabilityMeta
): Response {
  incrementRateLimited();
  if (meta) {
    logSecurityEvent({ ...meta, outcome: "rate_limited" });
  }
  const body = JSON.stringify(RATE_LIMITED_RESPONSE);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
    headers["Retry-After"] = String(Math.ceil(retryAfterSeconds));
  }
  return new Response(body, { status: 429, headers });
}

export function isRateLimitError(err: unknown): err is RateLimitError {
  return err instanceof Error && err.name === RATE_LIMIT_ERROR_NAME;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function getRedisUrl(): string | undefined {
  const url = process.env.ADMIN_REDIS_URL?.trim() || process.env.REDIS_URL?.trim();
  return url || undefined;
}

let storePromise: Promise<RateLimitStore> | null = null;
let storeTypeLogged = false;

async function getStore(): Promise<RateLimitStore> {
  if (!storePromise) {
    storePromise = (async (): Promise<RateLimitStore> => {
      const url = getRedisUrl();
      // Fail fast in production when Redis URL is missing — but allow builds to pass.
      // During `next build`, NEXT_PHASE is set; skip the hard gate so page data collection works.
      const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
      if (process.env.NODE_ENV === "production" && !url && !isBuildPhase) {
        throw new Error(
          "[RateLimit] Production requires ADMIN_REDIS_URL or REDIS_URL. Set one of them (e.g. redis://localhost:6379) or run with NODE_ENV=development for in-memory store."
        );
      }
      if (url) {
        const { default: Redis } = await import("ioredis");
        const { RedisRateLimitStore } = await import("./rateLimit/redisStore");
        const redis = new Redis(url);
        if (!storeTypeLogged) {
          console.log("RateLimitStore=Redis");
          storeTypeLogged = true;
        }
        return new RedisRateLimitStore(redis);
      }
      if (!storeTypeLogged) {
        console.log("RateLimitStore=Memory (dev only)");
        storeTypeLogged = true;
      }
      return new MemoryRateLimitStore();
    })();
  }
  return storePromise;
}

/**
 * Enforce rate limit. Throws RateLimitError when exceeded.
 * Production: Redis only. Development: Redis if URL set, else in-memory.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const store = await getStore();
  const windowMs = windowSeconds * 1000;
  const result = await store.consume(key, windowMs, limit);

  if (!result.allowed) {
    const error = new Error("RATE_LIMITED") as RateLimitError;
    error.name = RATE_LIMIT_ERROR_NAME;
    error.retryAfterSeconds = result.retryAfterSeconds;
    throw error;
  }
}

/** Default per-admin rate limit: 30 requests per 60 seconds for general admin API routes. */
export const ADMIN_RATE_LIMIT = { limit: 30, windowSeconds: 60 };

/**
 * Rate limit for admin routes. Use key prefix admin:${userId}:${routeName} (or admin:ip:${ip}:${routeName} when userId is null).
 */
export async function rateLimitAdmin(
  request: Request,
  routeName: string,
  userId: string | null
): Promise<void> {
  const key = userId
    ? `admin:${userId}:${routeName}`
    : `admin:ip:${getClientIp(request)}:${routeName}`;
  await rateLimit(key, ADMIN_RATE_LIMIT.limit, ADMIN_RATE_LIMIT.windowSeconds);
}
