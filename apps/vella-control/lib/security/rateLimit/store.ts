/**
 * Rate limit store abstraction. Enables in-memory (dev) vs Redis (production).
 * Matches MOBILE contract: atomic consume for correctness across instances.
 */
export interface RateLimitStore {
  /**
   * Atomically check if key is over limit and record hit if allowed.
   * @returns { allowed: true } or { allowed: false, retryAfterSeconds? }
   */
  consume(
    key: string,
    windowMs: number,
    max: number
  ): Promise<
    | { allowed: true }
    | { allowed: false; retryAfterSeconds?: number }
  >;
}
