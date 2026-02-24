/**
 * Optional Redis cache for subscription plan by user.
 * Used only when REDIS_URL is set. Key: subscription:${userId}, TTL: 60s.
 * Supabase public.subscriptions.plan remains the canonical source of truth;
 * this cache only reduces DB reads.
 */
import type { PlanTier } from "./tierCheck";

const CACHE_PREFIX = "subscription:";
const TTL_SECONDS = 60;

let redisPromise: Promise<import("ioredis").Redis | null> | null = null;

async function getRedis(): Promise<import("ioredis").Redis | null> {
  const url = process.env.REDIS_URL?.trim() || undefined;
  if (!url) return null;
  if (!redisPromise) {
    redisPromise = (async () => {
      try {
        const { default: Redis } = await import("ioredis");
        return new Redis(url);
      } catch (err) {
        console.error("[subscriptionPlanCache] Redis init failed", err);
        return null;
      }
    })();
  }
  return redisPromise;
}

function key(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

/** Get cached plan; returns null on miss or when Redis is not configured. */
export async function getCachedPlan(userId: string): Promise<PlanTier | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key(userId));
    if (raw === null || raw === undefined) return null;
    if (raw === "free" || raw === "pro" || raw === "elite") return raw as PlanTier;
    return null;
  } catch (err) {
    console.error("[subscriptionPlanCache] get error", err);
    return null;
  }
}

/** Set cached plan; TTL 60s. No-op when Redis is not configured. */
export async function setCachedPlan(userId: string, plan: PlanTier): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.setex(key(userId), TTL_SECONDS, plan);
  } catch (err) {
    console.error("[subscriptionPlanCache] set error", err);
  }
}

/** Invalidate cache for user (e.g. after webhook updates subscription). */
export async function invalidateSubscriptionPlanCache(userId: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.del(key(userId));
  } catch (err) {
    console.error("[subscriptionPlanCache] invalidate error", err);
  }
}
