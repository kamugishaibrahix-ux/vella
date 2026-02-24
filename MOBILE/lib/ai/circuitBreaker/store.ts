/**
 * Circuit breaker store abstraction for distributed state.
 * Tracks failure count in a time window and open/closed state with cooldown.
 */

export interface CircuitBreakerState {
  open: boolean;
  openUntil?: number;
}

export interface CircuitBreakerStore {
  /** Record a failure at the given timestamp (ms). */
  recordFailure(now: number): Promise<void>;
  /** Record a success (e.g. clear or transition from half-open to closed). */
  recordSuccess(now: number): Promise<void>;
  /** Whether the circuit is open and until when (ms). */
  isOpen(now: number): Promise<CircuitBreakerState>;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  windowMs: number;
  cooldownMs: number;
}

/** Safe defaults: 5 failures in 1 minute → open for 30s. */
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
};
