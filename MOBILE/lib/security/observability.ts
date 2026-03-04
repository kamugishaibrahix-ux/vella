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
  openAISuccesses: 0,
  tokenDeductCount: 0,
  tokenRefundCount: 0,
  rateLimit503Count: 0,
  dbUnavailableCount: 0,
  stripeWebhookDuplicateCount: 0,
};

// OpenAI latency histogram buckets (in ms): [0-100, 100-250, 250-500, 500-1000, 1000-2000, 2000-5000, 5000+]
const openAILatencyBuckets = [100, 250, 500, 1000, 2000, 5000];
const openAILatencyCounts = [0, 0, 0, 0, 0, 0, 0]; // 7 buckets (last is 5000+)

export function incrementRateLimited(): void {
  counters.rateLimited += 1;
}

export function incrementQuotaExceeded(): void {
  counters.quotaExceeded += 1;
}

export function incrementOpenAIFailure(): void {
  counters.openAIFailures += 1;
}

export function incrementOpenAISuccess(): void {
  counters.openAISuccesses += 1;
}

export function incrementTokenDeduct(): void {
  counters.tokenDeductCount += 1;
}

export function incrementTokenRefund(): void {
  counters.tokenRefundCount += 1;
}

export function incrementRateLimit503(): void {
  counters.rateLimit503Count += 1;
}

export function incrementDbUnavailable(): void {
  counters.dbUnavailableCount += 1;
}

export function incrementStripeWebhookDuplicate(): void {
  counters.stripeWebhookDuplicateCount += 1;
}

/** Record OpenAI latency for histogram distribution */
export function recordOpenAILatency(latencyMs: number): void {
  for (let i = 0; i < openAILatencyBuckets.length; i++) {
    if (latencyMs <= openAILatencyBuckets[i]) {
      openAILatencyCounts[i] += 1;
      return;
    }
  }
  openAILatencyCounts[openAILatencyCounts.length - 1] += 1; // 5000+ bucket
}

export function getSecurityCounts(): {
  rateLimited: number;
  quotaExceeded: number;
  openAIFailures: number;
  openAISuccesses: number;
  tokenDeductCount: number;
  tokenRefundCount: number;
  rateLimit503Count: number;
  dbUnavailableCount: number;
  stripeWebhookDuplicateCount: number;
} {
  return { ...counters };
}

export function getOpenAILatencyHistogram(): {
  buckets: string[];
  counts: number[];
} {
  return {
    buckets: [...openAILatencyBuckets.map((b) => `<=${b}ms`), ">5000ms"],
    counts: [...openAILatencyCounts],
  };
}

/** Reset all counters (for testing only) */
export function resetAllCounters(): void {
  counters.rateLimited = 0;
  counters.quotaExceeded = 0;
  counters.openAIFailures = 0;
  counters.openAISuccesses = 0;
  counters.tokenDeductCount = 0;
  counters.tokenRefundCount = 0;
  counters.rateLimit503Count = 0;
  counters.dbUnavailableCount = 0;
  counters.stripeWebhookDuplicateCount = 0;
  for (let i = 0; i < openAILatencyCounts.length; i++) {
    openAILatencyCounts[i] = 0;
  }
}

/** Structured log when an OpenAI call fails (for refund audit and debugging). */
export type OpenAIFailureLogMeta = {
  route: string;
  userId: string;
  requestId: string;
  errorType: string;
  refunded: boolean;
};

const OPENAI_FAILURE_LOG_PREFIX = "[openai_failure]";

export function logOpenAIFailure(meta: OpenAIFailureLogMeta): void {
  const payload = {
    route: meta.route,
    userId: hashForLog(meta.userId),
    requestId: meta.requestId,
    errorType: meta.errorType,
    refunded: meta.refunded,
  };
  try {
    console.error(OPENAI_FAILURE_LOG_PREFIX, JSON.stringify(payload));
  } catch {
    // avoid breaking the request if logging fails
  }
}

/** Token ledger integrity events (CRITICAL). Log and optionally block. */
export type TokenLedgerEventType =
  // Original integrity events
  | "negative_balance_after_deduct"
  | "duplicate_deduct_request_id"
  | "refund_no_matching_charge"
  | "duplicate_refund_request_id"
  // Lifecycle events (abort-safety instrumentation)
  | "monetised_operation_start"
  | "monetised_operation_end"
  | "client_abort_detected"
  | "charge_start"
  | "charge_complete"
  | "charge_failed"
  | "refund_start"
  | "refund_complete"
  | "refund_failed"
  // OpenAI operation events
  | "openai_start"
  | "openai_complete";

export type TokenLedgerEventMeta = {
  eventType: TokenLedgerEventType;
  userId: string;
  requestId: string;
  route?: string;
  channel?: string;
  operation?: string;
  operationName?: string;
  tokens?: number;
  refundedAmount?: number;
  remainingBalance?: number;
  errorCode?: string | null;
  error?: string;
  reason?: string;
  success?: boolean;
  warning?: string;
  // For abort detection tracking
  charged?: boolean;
  refunded?: boolean;
  successCommitted?: boolean;
  abortSignalReceived?: boolean;
};

const TOKEN_LEDGER_LOG_PREFIX = "[CRITICAL] token_ledger";

export function logTokenLedgerEvent(meta: TokenLedgerEventMeta): void {
  const payload = {
    event: meta.eventType,
    userIdHash: hashForLog(meta.userId),
    requestId: meta.requestId,
    route: meta.route ?? "",
    errorCode: meta.errorCode ?? "",
  };
  try {
    console.error(TOKEN_LEDGER_LOG_PREFIX, JSON.stringify(payload));
  } catch {
    // avoid breaking the request if logging fails
  }
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
