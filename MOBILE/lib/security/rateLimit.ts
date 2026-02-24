/**
 * Production-grade rate limiting with store abstraction.
 * - Development: in-memory store (single instance) when REDIS_URL is unset.
 * - Production: Redis required (REDIS_URL must be set); throws on boot if missing.
 *
 * Supports IP-based (pre-auth) and user-based (post-auth) limiting.
 */
import type { RateLimitStore } from "./rateLimit/store";
import { MemoryRateLimitStore } from "./rateLimit/memoryStore";
import type { ObservabilityMeta } from "./observability";
import { incrementRateLimited, logSecurityEvent } from "./observability";

export const RATE_LIMIT_ERROR_NAME = "RateLimitError";

/** Stable JSON shape for 429 responses */
export const RATE_LIMITED_RESPONSE = {
  code: "RATE_LIMITED" as const,
  message: "Too many requests. Please try again later.",
};

export type RateLimitOptions = {
  key: string;
  limit: number;
  window: number; // seconds
};

/** Extends Error with optional retryAfterSeconds for Retry-After header */
export interface RateLimitError extends Error {
  name: "RateLimitError";
  retryAfterSeconds?: number;
}

/**
 * Returns a standardized 429 NextResponse. Use in route catch blocks when RateLimitError is thrown.
 * Pass optional meta for privacy-safe structured logging (route, hashed userId/ip, latency).
 */
export function rateLimit429Response(
  retryAfterSeconds?: number,
  meta?: ObservabilityMeta
): Response {
  incrementRateLimited();
  if (meta) {
    logSecurityEvent({ ...meta, outcome: "rate_limited" });
  }
  const body = JSON.stringify(RATE_LIMITED_RESPONSE);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
    headers["Retry-After"] = String(Math.ceil(retryAfterSeconds));
  }
  return new Response(body, { status: 429, headers });
}

/** Type guard for RateLimitError */
export function isRateLimitError(err: unknown): err is RateLimitError {
  return err instanceof Error && err.name === RATE_LIMIT_ERROR_NAME;
}

let storePromise: Promise<RateLimitStore> | null = null;
let storeTypeLogged = false;

async function getStore(): Promise<RateLimitStore> {
  if (!storePromise) {
    storePromise = (async (): Promise<RateLimitStore> => {
      const url = process.env.REDIS_URL?.trim() || undefined;
      // Fail when store is first used in production without REDIS_URL (not at import, so build can complete).
      if (process.env.NODE_ENV === "production" && !url) {
        throw new Error(
          "[RateLimit] Production requires REDIS_URL. Set REDIS_URL (e.g. redis://localhost:6379) or run with NODE_ENV=development for in-memory store."
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
 * Production: Redis only (throws if REDIS_URL missing). Development: Redis if set, else in-memory.
 */
export async function rateLimit({ key, limit, window }: RateLimitOptions): Promise<void> {
  const store = await getStore();
  const windowMs = window * 1000;
  const result = await store.consume(key, windowMs, limit);

  if (!result.allowed) {
    const error = new Error("RATE_LIMITED") as RateLimitError;
    error.name = RATE_LIMIT_ERROR_NAME;
    error.retryAfterSeconds = result.retryAfterSeconds;
    throw error;
  }
}

/**
 * Extract client IP from request. Use for pre-auth rate limiting.
 * Parses x-forwarded-for (first IP) or x-real-ip; falls back to "unknown".
 */
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

/**
 * Rate limit by IP (pre-auth). Use for public endpoints.
 */
export async function rateLimitByIp(
  req: Request,
  routeKey: string,
  limit: number,
  window: number
): Promise<void> {
  const ip = getClientIp(req);
  await rateLimit({ key: `ip:${routeKey}:${ip}`, limit, window });
}

/**
 * Rate limit by user (post-auth). Use for authenticated endpoints.
 */
export async function rateLimitByUser(
  userId: string,
  routeKey: string,
  limit: number,
  window: number
): Promise<void> {
  await rateLimit({ key: `user:${routeKey}:${userId}`, limit, window });
}

export { RATE_LIMIT_CONFIG } from "./rateLimit/config";
