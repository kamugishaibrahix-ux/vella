/**
 * Redis-backed circuit breaker store for production.
 * Shared across instances: failure count in window + openUntil timestamp.
 */
import type { Redis } from "ioredis";
import type { CircuitBreakerStore, CircuitBreakerState, CircuitBreakerConfig } from "./store";
import { DEFAULT_CIRCUIT_CONFIG } from "./store";

const KEY_FAILURES = "openai:circuit:failures";
const KEY_OPEN_UNTIL = "openai:circuit:openUntil";

// Lua: add failure, prune window, if count >= threshold set openUntil. Returns openUntil (0 if not set).
// KEYS[1]=failures, KEYS[2]=openUntil, ARGV[1]=now, ARGV[2]=windowMs, ARGV[3]=threshold, ARGV[4]=cooldownMs, ARGV[5]=member
const LUA_RECORD_FAILURE = `
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local threshold = tonumber(ARGV[3])
local cooldown_ms = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window_ms)
redis.call('ZADD', KEYS[1], now, ARGV[5])
local count = redis.call('ZCARD', KEYS[1])
local open_until = 0
if count >= threshold then
  open_until = now + cooldown_ms
  redis.call('SET', KEYS[2], open_until, 'PX', cooldown_ms + 5000)
end
redis.call('PEXPIRE', KEYS[1], window_ms + 5000)
return open_until
`;

export class RedisCircuitBreakerStore implements CircuitBreakerStore {
  constructor(
    private redis: Redis,
    private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG
  ) {}

  async isOpen(now: number): Promise<CircuitBreakerState> {
    const raw = await this.redis.get(KEY_OPEN_UNTIL);
    if (!raw) return { open: false };
    const openUntil = parseInt(raw, 10);
    if (Number.isNaN(openUntil)) return { open: false };
    if (now < openUntil) return { open: true, openUntil };
    return { open: false, openUntil };
  }

  async recordFailure(now: number): Promise<void> {
    const { windowMs, failureThreshold, cooldownMs } = this.config;
    const member = `${now}:${Math.random().toString(36).slice(2)}`;
    await this.redis.eval(
      LUA_RECORD_FAILURE,
      2,
      KEY_FAILURES,
      KEY_OPEN_UNTIL,
      String(now),
      String(windowMs),
      String(failureThreshold),
      String(cooldownMs),
      member
    );
  }

  async recordSuccess(now: number): Promise<void> {
    const raw = await this.redis.get(KEY_OPEN_UNTIL);
    if (!raw) return;
    const openUntil = parseInt(raw, 10);
    if (Number.isNaN(openUntil) || now < openUntil) return;
    await this.redis.del(KEY_OPEN_UNTIL);
    await this.redis.del(KEY_FAILURES);
  }
}
