/**
 * Minimal, privacy-safe security observability (same contract as MOBILE).
 * - Do NOT log user content, prompts, or PII.
 * - Log only metadata: route, hashed userId, optional hashed ip, outcome, latency.
 * - Counters for rate_limited, quota_exceeded (abuse pattern detection).
 */

import { createHash } from "crypto";

export type SecurityOutcome =
  | "ok"
  | "rate_limited"
  | "quota_exceeded"
  | "validation_error"
  | "server_error";

export interface SecurityEventMeta {
  requestId: string;
  routeName: string;
  userId?: string;
  ip?: string;
  outcome: SecurityOutcome;
  latencyMs: number;
}

export function hashForLog(value: string): string {
  if (!value || value === "unknown") return "";
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

const counters = {
  rateLimited: 0,
  quotaExceeded: 0,
};

export function incrementRateLimited(): void {
  counters.rateLimited += 1;
}

export function incrementQuotaExceeded(): void {
  counters.quotaExceeded += 1;
}

export function getSecurityCounts(): { rateLimited: number; quotaExceeded: number } {
  return { ...counters };
}

const LOG_PREFIX = "[security]";

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

export interface ObservabilityMeta {
  requestId: string;
  routeName: string;
  userId?: string;
  ip?: string;
  latencyMs: number;
}

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
