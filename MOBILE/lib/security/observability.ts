/**
 * Minimal, privacy-safe security observability.
 * - Do NOT log user content, prompts, messages, journal text, or PII.
 * - Log only metadata: route, hashed userId, optional hashed ip, outcome, latency.
 * - Counters for rate_limited, quota_exceeded, OpenAI failures (abuse pattern detection).
 */

import { createHash } from "crypto";

export type SecurityOutcome =
  | "ok"
  | "rate_limited"
  | "quota_exceeded"
  | "validation_error"
  | "server_error"
  | "crisis_event_write_failed";

export interface SecurityEventMeta {
  requestId: string;
  routeName: string;
  userId?: string;
  ip?: string;
  outcome: SecurityOutcome;
  latencyMs: number;
}

/** Deterministic hash for logging; same input → same hash. Never log raw values. */
export function hashForLog(value: string): string {
  if (!value || value === "unknown") return "";
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

/** In-memory counters for abuse pattern detection. Reset on process restart. */
const counters = {
  rateLimited: 0,
  quotaExceeded: 0,
  openAIFailures: 0,
};

export function incrementRateLimited(): void {
  counters.rateLimited += 1;
}

export function incrementQuotaExceeded(): void {
  counters.quotaExceeded += 1;
}

export function incrementOpenAIFailure(): void {
  counters.openAIFailures += 1;
}

export function getSecurityCounts(): { rateLimited: number; quotaExceeded: number; openAIFailures: number } {
  return { ...counters };
}

const LOG_PREFIX = "[security]";

/**
 * Emit a single structured log line. No user content or PII; userId and ip are hashed.
 */
export function logSecurityEvent(meta: SecurityEventMeta): void {
  const payload: Record<string, unknown> = {
    requestId: meta.requestId,
    route: meta.routeName,
    outcome: meta.outcome,
    latencyMs: meta.latencyMs,
  };
  if (meta.userId) payload.userIdHash = hashForLog(meta.userId);
  if (meta.ip) payload.ipHash = hashForLog(meta.ip);
  try {
    console.log(LOG_PREFIX, JSON.stringify(payload));
  } catch {
    // avoid breaking the request if logging fails
  }
}

/**
 * Optional metadata to pass when returning error responses. Outcome is set by the response helper when logging.
 */
export interface ObservabilityMeta {
  requestId: string;
  routeName: string;
  userId?: string;
  ip?: string;
  latencyMs: number;
}

/**
 * Build ObservabilityMeta for the current request. Call when returning a response.
 * outcome is supplied by the response helper or by the caller when logging ok.
 */
export function buildObservabilityMeta(
  requestId: string,
  routeName: string,
  startMs: number,
  options?: { userId?: string; ip?: string }
): ObservabilityMeta {
  return {
    requestId,
    routeName,
    latencyMs: Date.now() - startMs,
    userId: options?.userId,
    ip: options?.ip,
  };
}
