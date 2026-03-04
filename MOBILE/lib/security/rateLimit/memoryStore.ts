import type { RateLimitStore } from "./store";
import { createBoundedMap } from "@/lib/utils/lruCache";

/**
 * In-memory rate limit store with bounded growth.
 *
 * SAFETY LIMITS:
 * - maxEntries: 10,000 (LRU eviction)
 * - ttlMs: 5 minutes (auto-cleanup of stale entries)
 *
 * Prevents unbounded memory growth under high concurrency or
 * attack scenarios with many unique keys.
 */
const MAX_ENTRIES = 10_000;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

/** In-memory store for local dev. Not shared across instances. */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets: Map<string, number[]>;

  constructor() {
    // Use bounded map with LRU eviction and TTL cleanup
    this.buckets = createBoundedMap<string, number[]>(MAX_ENTRIES, TTL_MS);
  }

  async consume(
    key: string,
    windowMs: number,
    max: number
  ): Promise<
    | { allowed: true }
    | { allowed: false; retryAfterSeconds?: number }
  > {
    const now = Date.now();

    // Get existing timestamps (get() handles TTL expiration)
    const timestamps = this.buckets.get(key) ?? [];

    // Filter to window
    const recent = timestamps.filter((ts) => now - ts < windowMs);

    if (recent.length >= max) {
      const oldest = Math.min(...recent);
      const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds > 0 ? retryAfterSeconds : undefined,
      };
    }

    // Store updated timestamps (set() handles LRU eviction)
    this.buckets.set(key, [...recent, now]);
    return { allowed: true };
  }

  /**
   * Get current stats for monitoring
   */
  getStats(): { size: number; maxEntries: number; ttlMs: number } {
    return {
      size: this.buckets.size,
      maxEntries: MAX_ENTRIES,
      ttlMs: TTL_MS,
    };
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    // Call destroy method if available (cleanup timers)
    if ((this.buckets as any).destroy) {
      (this.buckets as any).destroy();
    } else {
      this.buckets.clear();
    }
  }
}
