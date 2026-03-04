/**
 * Structured security telemetry events.
 * Emitted for plan resolution failures, tier corruption, and other security-relevant events.
 * These must not depend on console logs only — they produce structured payloads
 * suitable for ingestion by observability platforms.
 */

export type SecurityEventName =
  | "PLAN_RESOLUTION_FAILED"
  | "TIER_CORRUPTION"
  | "LEGACY_TIER_ALIAS_BLOCKED"
  | "PLAN_LOOKUP_FAILURE"
  | "BULK_RECALC_CORRUPTION"
  | "STRIPE_WEBHOOK_INVALID_TIER"
  | "CONTRACT_PLAN_RESOLUTION_FAILED"
  | "CONTRACT_INVALID_SELECTED_DOMAINS";

export interface SecurityEventPayload {
  event: SecurityEventName;
  request_id?: string;
  user_id?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

const eventBuffer: SecurityEventPayload[] = [];

/**
 * Emit a structured security event.
 * Logs to stderr with a structured JSON payload and buffers for batch export.
 */
export function logSecurityEvent(
  eventName: SecurityEventName,
  metadata: Record<string, unknown>
): void {
  const payload: SecurityEventPayload = {
    event: eventName,
    request_id: (metadata.request_id as string) ?? undefined,
    user_id: (metadata.user_id as string) ?? undefined,
    timestamp: new Date().toISOString(),
    metadata,
  };

  console.error(`[SECURITY_EVENT:${eventName}]`, JSON.stringify(payload));

  eventBuffer.push(payload);

  if (eventBuffer.length > 1000) {
    eventBuffer.splice(0, eventBuffer.length - 500);
  }
}

/**
 * Drain buffered events for batch export (e.g., to an external service).
 */
export function drainSecurityEvents(): SecurityEventPayload[] {
  return eventBuffer.splice(0, eventBuffer.length);
}
