/**
 * Structured security telemetry events for the admin panel.
 * Mirror of MOBILE/lib/telemetry/securityEvents.ts for the vella-control app scope.
 */

export type SecurityEventName =
  | "PLAN_RESOLUTION_FAILED"
  | "TIER_CORRUPTION"
  | "LEGACY_TIER_ALIAS_BLOCKED"
  | "PLAN_LOOKUP_FAILURE"
  | "BULK_RECALC_CORRUPTION"
  | "STRIPE_WEBHOOK_INVALID_TIER";

export function logSecurityEvent(
  eventName: SecurityEventName,
  metadata: Record<string, unknown>
): void {
  const payload = {
    event: eventName,
    request_id: (metadata.request_id as string) ?? undefined,
    user_id: (metadata.user_id as string) ?? undefined,
    timestamp: new Date().toISOString(),
    metadata,
  };

  console.error(`[SECURITY_EVENT:${eventName}]`, JSON.stringify(payload));
}
