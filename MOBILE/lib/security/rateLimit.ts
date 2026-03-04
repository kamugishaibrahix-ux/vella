/**
 * Production-grade rate limiting with store abstraction.
 * - Development: in-memory store (single instance) when REDIS_URL is unset.
 * - Production: Redis required (REDIS_URL must be set); throws on boot if missing.
 *
 * Phase 3.3: Redis Failure Policy
 * - Money-spending endpoints: FAIL-CLOSED (deny when Redis down)
 * - Non-sensitive endpoints: FAIL-OPEN (allow with local fallback throttle)
 * - Never throws. Always returns RateLimitResult.
 *
 * Supports IP-based (pre-auth) and user-based (post-auth) limiting.
 */
import type { RateLimitStore } from "./rateLimit/store";
import { MemoryRateLimitStore } from "./rateLimit/memoryStore";
import type { ObservabilityMeta } from "./observability";
import { incrementRateLimited, incrementRateLimit503, logSecurityEvent } from "./observability";
import { getRateLimitPolicy, type RateLimitPolicy } from "./rateLimitPolicy";

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
  routeKey: string; // Phase 3.3: Required for policy lookup
};

/** Phase 3.3: Structured result - rateLimit() never throws */
export type RateLimitResult = {
  allowed: boolean;
  reason: "ok" | "limited" | "redis_down";
  policy: RateLimitPolicy;
  status: 200 | 429 | 503;
  retryAfterSeconds?: number;
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

/**
 * Returns a standardized 503 response for Redis-down closed-policy endpoints.
 */
export function rateLimit503Response(reason = "Service temporarily unavailable"): Response {
  const body = JSON.stringify({
    code: "SERVICE_UNAVAILABLE",
    message: reason,
  });
  return new Response(body, {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": "60",
    },
  });
}

/** Type guard for RateLimitError */
export function isRateLimitError(err: unknown): err is RateLimitError {
  return err instanceof Error && err.name === RATE_LIMIT_ERROR_NAME;
}

let storePromise: Promise<RateLimitStore> | null = null;
let storeTypeLogged = false;
let redisDownLogged = false;

/** Phase 3.3: Force Redis down mode for testing (RATE_LIMIT_FORCE_REDIS_DOWN=1) */
function isForceRedisDown(): boolean {
  return process.env.RATE_LIMIT_FORCE_REDIS_DOWN === "1";
}

async function getStore(): Promise<RateLimitStore | null> {
  if (isForceRedisDown()) {
    return null; // Simulate Redis down
  }

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
        try {
          const { default: Redis } = await import("ioredis");
          const { RedisRateLimitStore } = await import("./rateLimit/redisStore");
          const redis = new Redis(url, {
            lazyConnect: true,
            connectTimeout: 5000,
            commandTimeout: 5000,
            retryStrategy: (times) => Math.min(times * 100, 3000),
            maxRetriesPerRequest: 3,
          });
          // Test connection
          await redis.ping();
          if (!storeTypeLogged) {
            storeTypeLogged = true;
          }
          return new RedisRateLimitStore(redis);
        } catch (err) {
          // Redis connection failed
          redisDownLogged = true;
          return null as unknown as RateLimitStore; // Will trigger fallback
        }
      }

      if (!storeTypeLogged) {
        storeTypeLogged = true;
      }
      return new MemoryRateLimitStore();
    })().catch(() => {
      // Any error means Redis is effectively down
      redisDownLogged = true;
      return null as unknown as RateLimitStore;
    });
  }

  try {
    const store = await storePromise;
    return store;
  } catch {
    return null;
  }
}

// Phase 3.3: Local fallback throttle (only used when Redis is down)
// Conservative limits for fail-open endpoints
// BOUNDED: Max 5,000 entries with LRU eviction and 5-min TTL
interface FallbackEntry {
  count: number;
  resetAt: number;
}

// Use a factory function to create bounded map
function createBoundedThrottleMap(): Map<string, FallbackEntry> {
  const MAX_ENTRIES = 5_000;
  const TTL_MS = 5 * 60 * 1000; // 5 minutes

  const map = new Map<string, FallbackEntry>();

  // Track entry timestamps for TTL
  const timestamps = new Map<string, number>();

  const originalSet = map.set.bind(map);
  const originalDelete = map.delete.bind(map);
  const originalGet = map.get.bind(map);

  // Override set to enforce LRU eviction
  map.set = (key: string, value: FallbackEntry) => {
    // Remove if exists (to update order)
    if (map.has(key)) {
      map.delete(key);
    }

    // Evict oldest if at capacity
    while (map.size >= MAX_ENTRIES) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) {
        map.delete(firstKey);
      }
    }

    // Set new value
    originalSet(key, value);
    timestamps.set(key, Date.now());

    return map;
  };

  // Override delete
  map.delete = (key: string) => {
    timestamps.delete(key);
    return originalDelete(key);
  };

  // Override get to check TTL
  map.get = (key: string) => {
    if (timestamps.has(key)) {
      const timestamp = timestamps.get(key)!;
      if (Date.now() - timestamp > TTL_MS) {
        map.delete(key);
        return undefined;
      }
    }
    return originalGet(key);
  };

  // Periodic cleanup of expired entries
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of timestamps) {
      if (now - timestamp > TTL_MS) {
        map.delete(key);
      }
    }
  }, 60000); // Every minute

  // Allow process to exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return map;
}

const fallbackThrottles = createBoundedThrottleMap();
const FALLBACK_IP_LIMIT = 20; // per minute
const FALLBACK_USER_LIMIT = 30; // per minute
const FALLBACK_WINDOW_MS = 60000; // 60 seconds

/**
 * Phase 3.3: Check local fallback throttle.
 * Only used when Redis is down for "open" policy endpoints.
 */
function checkFallbackThrottle(key: string, limit: number): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = fallbackThrottles.get(key);

  if (!entry || now >= entry.resetAt) {
    // New window
    fallbackThrottles.set(key, {
      count: 1,
      resetAt: now + FALLBACK_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (entry.count >= limit) {
    // Rate limited
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  // Increment and allow
  entry.count++;
  return { allowed: true };
}

/**
 * Phase 3.3: Get appropriate fallback limit based on key type.
 */
function getFallbackLimit(key: string): number {
  if (key.startsWith("ip:")) {
    return FALLBACK_IP_LIMIT;
  }
  if (key.startsWith("user:")) {
    return FALLBACK_USER_LIMIT;
  }
  // Default conservative limit
  return FALLBACK_IP_LIMIT;
}

/**
 * Phase 3.3: Enforce rate limit. NEVER throws.
 * Returns RateLimitResult with deterministic behavior based on policy.
 *
 * - Redis OK: Normal operation
 * - Redis Down + Policy="closed": Deny with 503
 * - Redis Down + Policy="open": Allow with local fallback throttle
 */
export async function rateLimit({ key, limit, window, routeKey }: RateLimitOptions): Promise<RateLimitResult> {
  const policy = getRateLimitPolicy(routeKey);
  const store = await getStore();

  // Redis is down or unavailable
  if (!store) {
    if (policy === "closed") {
      // FAIL-CLOSED: Deny the request
      incrementRateLimit503();
      return {
        allowed: false,
        reason: "redis_down",
        policy: "closed",
        status: 503,
        retryAfterSeconds: 60,
      };
    }

    // FAIL-OPEN: Use local fallback throttle
    const fallbackLimit = getFallbackLimit(key);
    const fallbackResult = checkFallbackThrottle(key, fallbackLimit);

    if (!fallbackResult.allowed) {
      return {
        allowed: false,
        reason: "limited",
        policy: "open",
        status: 429,
        retryAfterSeconds: fallbackResult.retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      reason: "redis_down",
      policy: "open",
      status: 200,
    };
  }

  // Redis is available - normal operation
  try {
    const windowMs = window * 1000;
    const result = await store.consume(key, windowMs, limit);

    if (!result.allowed) {
      return {
        allowed: false,
        reason: "limited",
        policy,
        status: 429,
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      reason: "ok",
      policy,
      status: 200,
    };
  } catch {
    // Store error - treat as Redis down
    if (policy === "closed") {
      incrementRateLimit503();
      return {
        allowed: false,
        reason: "redis_down",
        policy: "closed",
        status: 503,
        retryAfterSeconds: 60,
      };
    }

    // FAIL-OPEN with fallback
    const fallbackLimit = getFallbackLimit(key);
    const fallbackResult = checkFallbackThrottle(key, fallbackLimit);

    if (!fallbackResult.allowed) {
      return {
        allowed: false,
        reason: "limited",
        policy: "open",
        status: 429,
        retryAfterSeconds: fallbackResult.retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      reason: "redis_down",
      policy: "open",
      status: 200,
    };
  }
}

/**
 * Backward-compatible rate limit that throws RateLimitError.
 * DEPRECATED: Use rateLimit() which returns RateLimitResult.
 *
 * Only for legacy routes not yet migrated to explicit policy.
 */
export async function rateLimitLegacy({ key, limit, window }: Omit<RateLimitOptions, "routeKey">): Promise<void> {
  const store = await getStore();
  if (!store) {
    // Legacy behavior: allow when Redis down (dev only)
    return;
  }
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
 * Phase 3.3: Rate limit by IP with explicit policy.
 */
export async function rateLimitByIp(
  req: Request,
  routeKey: string,
  limit: number,
  window: number
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  return rateLimit({ key: `ip:${routeKey}:${ip}`, limit, window, routeKey });
}

/**
 * Phase 3.3: Rate limit by user with explicit policy.
 */
export async function rateLimitByUser(
  userId: string,
  routeKey: string,
  limit: number,
  window: number
): Promise<RateLimitResult> {
  return rateLimit({ key: `user:${routeKey}:${userId}`, limit, window, routeKey });
}

/**
 * Legacy: Rate limit by IP (pre-auth). Use for public endpoints.
 * DEPRECATED: Use rateLimitByIp with explicit routeKey.
 */
export async function rateLimitByIpLegacy(
  req: Request,
  routeKey: string,
  limit: number,
  window: number
): Promise<void> {
  const ip = getClientIp(req);
  await rateLimitLegacy({ key: `ip:${routeKey}:${ip}`, limit, window });
}

/**
 * Legacy: Rate limit by user (post-auth). Use for authenticated endpoints.
 * DEPRECATED: Use rateLimitByUser with explicit routeKey.
 */
export async function rateLimitByUserLegacy(
  userId: string,
  routeKey: string,
  limit: number,
  window: number
): Promise<void> {
  await rateLimitLegacy({ key: `user:${routeKey}:${userId}`, limit, window });
}

export { RATE_LIMIT_CONFIG } from "./rateLimit/config";
