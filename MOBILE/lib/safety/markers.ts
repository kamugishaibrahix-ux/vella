import type { AuditEvent } from "@/lib/audit/types";

/** Returns a safe audit event. Reason is not persisted (privacy: no free-text). */
export function markSafetyIntervention(_reason: string): AuditEvent {
  return {
    type: "SAFETY_INTERVENTION",
    timestamp: Date.now(),
    outcome: "intervention",
  };
}
