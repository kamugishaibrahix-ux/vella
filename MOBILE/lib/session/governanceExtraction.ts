/**
 * Extract governance signals from a closed session summary.
 * Calls existing recordEvent with structured codes only. No free text.
 * Server-only (used from API route).
 */

import { recordEvent } from "@/lib/governance/events";
import type { SessionSummary } from "./summariseSession";

export type SessionGovernanceSignal =
  | "CONTRADICTION"
  | "ESCALATION"
  | "VALUE_MISALIGNMENT"
  | "COMMITMENT_WEAKENING"
  | "BOUNDARY_TENSION";

/**
 * Map session summary to governance events. Uses scheduler_tick with metadata
 * so we don't require new DB enum values. Only structured codes.
 */
export async function extractGovernanceSignalsFromSession(
  userId: string,
  summary: SessionSummary
): Promise<void> {
  const meta = (signal: SessionGovernanceSignal) => ({
    session_signal: signal,
    session_id: summary.sessionId.replace(/-/g, "_").slice(0, 50),
  });

  if (summary.contradictionsDetected) {
    await recordEvent(userId, "scheduler_tick", undefined, undefined, meta("CONTRADICTION"));
  }
  if (summary.emotionalTone === "distressed") {
    await recordEvent(userId, "scheduler_tick", undefined, undefined, meta("ESCALATION"));
  }
  if (summary.valueAlignmentShift) {
    await recordEvent(userId, "scheduler_tick", undefined, undefined, meta("VALUE_MISALIGNMENT"));
  }
  if (summary.contradictionsDetected && summary.dominantTopics.includes("contradiction")) {
    await recordEvent(userId, "scheduler_tick", undefined, undefined, meta("COMMITMENT_WEAKENING"));
  }
  if (summary.dominantTopics.includes("boundary")) {
    await recordEvent(userId, "scheduler_tick", undefined, undefined, meta("BOUNDARY_TENSION"));
  }
}
