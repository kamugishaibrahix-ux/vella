import type { IncidentRecord } from "./types";
import { logAuditEvent } from "@/lib/audit/logger";

export function reportIncident(record: IncidentRecord) {
  logAuditEvent({
    type: "SAFETY_INTERVENTION",
    timestamp: record.timestamp,
    outcome: "incident",
  });
}

