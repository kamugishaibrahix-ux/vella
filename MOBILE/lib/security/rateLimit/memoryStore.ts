import type { RateLimitStore } from "./store";

/** In-memory store for local dev. Not shared across instances. */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, number[]>();

  async consume(
    key: string,
    windowMs: number,
    max: number
  ): Promise<
    | { allowed: true }
    | { allowed: false; retryAfterSeconds?: number }
  > {
    const now = Date.now();
    const timestamps = this.buckets.get(key) ?? [];
    const recent = timestamps.filter((ts) => now - ts < windowMs);

    if (recent.length >= max) {
      const oldest = Math.min(...recent);
      const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds > 0 ? retryAfterSeconds : undefined,
      };
    }

    this.buckets.set(key, [...recent, now]);
    return { allowed: true };
  }
}
