/**
 * Redis-backed rate limit store for production multi-instance deployment.
 * Uses sliding window via sorted set. Requires ioredis and REDIS_URL or ADMIN_REDIS_URL.
 */
import type { Redis } from "ioredis";
import type { RateLimitStore } from "./store";

// Lua: atomic check + record. Returns [allowed, retryAfterSeconds]
// KEYS[1]=key, ARGV[1]=now_ms, ARGV[2]=window_ms, ARGV[3]=max, ARGV[4]=unique_id
const LUA_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window_ms)
local count = redis.call('ZCARD', key)
if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_sec = 0
  if oldest[1] then
    retry_sec = math.ceil((tonumber(oldest[2]) + window_ms - now) / 1000)
  end
  return {0, math.max(0, retry_sec)}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window_ms + 1000)
return {1, 0}
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: Redis) {}

  async consume(
    key: string,
    windowMs: number,
    max: number
  ): Promise<
    | { allowed: true }
    | { allowed: false; retryAfterSeconds?: number }
  > {
    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).slice(2)}`;
    const result = (await this.redis.eval(
      LUA_SCRIPT,
      1,
      key,
      String(now),
      String(windowMs),
      String(max),
      member
    )) as [number, number];

    const [allowed, retrySec] = result;
    if (allowed === 1) {
      return { allowed: true };
    }
    return {
      allowed: false,
      retryAfterSeconds: retrySec > 0 ? retrySec : undefined,
    };
  }
}
