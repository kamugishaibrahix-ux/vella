/**
 * Distributed circuit breaker for OpenAI (and other external providers).
 * - Production: Redis-backed store when REDIS_URL is set (shared across instances).
 * - Development: in-memory store (single process).
 *
 * When failures in a sliding window exceed threshold, circuit opens and all instances
 * fail fast with 503 for the cooldown period. Reduces request pile-up and cost under outage.
 *
 * Documented thresholds: 5 failures in 1 minute → open for 30s (see circuitBreaker/store.ts).
 */

import type { CircuitBreakerStore } from "./circuitBreaker/store";
import { DEFAULT_CIRCUIT_CONFIG } from "./circuitBreaker/store";
import { MemoryCircuitBreakerStore } from "./circuitBreaker/memoryStore";

let storePromise: Promise<CircuitBreakerStore> | null = null;
let storeLogged = false;

async function getStore(): Promise<CircuitBreakerStore> {
  if (!storePromise) {
    storePromise = (async (): Promise<CircuitBreakerStore> => {
      const url = process.env.REDIS_URL?.trim() || undefined;
      if (url) {
        const { default: Redis } = await import("ioredis");
        const { RedisCircuitBreakerStore } = await import("./circuitBreaker/redisStore");
        const redis = new Redis(url);
        if (!storeLogged) {
          console.log("CircuitBreakerStore=Redis");
          storeLogged = true;
        }
        return new RedisCircuitBreakerStore(redis, DEFAULT_CIRCUIT_CONFIG);
      }
      if (!storeLogged) {
        console.log("CircuitBreakerStore=Memory (dev only)");
        storeLogged = true;
      }
      return new MemoryCircuitBreakerStore(DEFAULT_CIRCUIT_CONFIG);
    })();
  }
  return storePromise;
}

type State = "closed" | "open" | "half-open";

export async function getOpenAICircuitState(): Promise<{
  isOpen: boolean;
  state: State;
  openUntil?: number;
}> {
  const store = await getStore();
  const now = Date.now();
  const { open, openUntil } = await store.isOpen(now);
  const state: State = open ? "open" : openUntil !== undefined ? "half-open" : "closed";
  return { isOpen: open, state, openUntil };
}

export async function recordOpenAIFailure(): Promise<void> {
  const store = await getStore();
  await store.recordFailure(Date.now());
}

export async function recordOpenAISuccess(): Promise<void> {
  const store = await getStore();
  await store.recordSuccess(Date.now());
}

export class CircuitOpenError extends Error {
  constructor(public openUntil?: number) {
    super("OPENAI_CIRCUIT_OPEN");
    this.name = "CircuitOpenError";
  }
}

/**
 * Run an OpenAI-dependent operation through the circuit breaker.
 * Throws CircuitOpenError when circuit is open (caller should return 503).
 * Behaviour identical from caller perspective; state is now shared via Redis in production.
 * Tracks success/failure counters and latency histogram for observability.
 */
export async function runWithOpenAICircuit<T>(fn: () => Promise<T>): Promise<T> {
  const store = await getStore();
  const now = Date.now();
  const { open, openUntil } = await store.isOpen(now);
  if (open) {
    throw new CircuitOpenError(openUntil);
  }
  const startMs = Date.now();
  try {
    const result = await fn();
    await store.recordSuccess(Date.now());
    const { incrementOpenAISuccess, recordOpenAILatency } = await import("@/lib/security/observability");
    incrementOpenAISuccess();
    recordOpenAILatency(Date.now() - startMs);
    return result;
  } catch (err) {
    const { incrementOpenAIFailure, recordOpenAILatency } = await import("@/lib/security/observability");
    incrementOpenAIFailure();
    recordOpenAILatency(Date.now() - startMs);
    await store.recordFailure(Date.now());
    throw err;
  }
}

export function isCircuitOpenError(err: unknown): err is CircuitOpenError {
  return err instanceof CircuitOpenError;
}

/** Exported for documentation and tests. */
export const OPENAI_CIRCUIT_CONFIG = DEFAULT_CIRCUIT_CONFIG;
