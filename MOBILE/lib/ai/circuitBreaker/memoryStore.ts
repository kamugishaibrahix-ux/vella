import type { CircuitBreakerStore, CircuitBreakerState, CircuitBreakerConfig } from "./store";
import { DEFAULT_CIRCUIT_CONFIG } from "./store";

type State = "closed" | "open" | "half-open";

/** In-memory store for single-instance / dev. Not shared across processes. */
export class MemoryCircuitBreakerStore implements CircuitBreakerStore {
  private state: State = "closed";
  private failureTimes: number[] = [];
  private openedAt: number = 0;

  constructor(private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG) {}

  async isOpen(now: number): Promise<CircuitBreakerState> {
    const { windowMs, cooldownMs, failureThreshold } = this.config;
    if (this.state === "open") {
      if (now - this.openedAt >= cooldownMs) {
        this.state = "half-open";
        this.failureTimes = [];
        return { open: false, openUntil: this.openedAt + cooldownMs };
      }
      return { open: true, openUntil: this.openedAt + cooldownMs };
    }
    if (this.state === "half-open") {
      return { open: false };
    }
    const windowStart = now - windowMs;
    this.failureTimes = this.failureTimes.filter((t) => t > windowStart);
    const isOpen = this.failureTimes.length >= failureThreshold;
    if (isOpen) {
      this.state = "open";
      this.openedAt = now;
      return { open: true, openUntil: now + cooldownMs };
    }
    return { open: false };
  }

  async recordFailure(now: number): Promise<void> {
    this.failureTimes.push(now);
    const { open } = await this.isOpen(now);
    if (open) {
      this.state = "open";
      this.openedAt = now;
    }
  }

  async recordSuccess(now: number): Promise<void> {
    if (this.state === "half-open") {
      this.state = "closed";
      this.failureTimes = [];
    } else if (this.state === "closed") {
      const windowStart = now - this.config.windowMs;
      this.failureTimes = this.failureTimes.filter((t) => t > windowStart);
    }
  }
}
