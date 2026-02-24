/**
 * Hybrid Coupling v1: Resolve requested mode using governance state.
 * Pure function; no randomness. Crisis always allowed; challenge gated by risk.
 */

import type { VellaMode } from "./modes";
import { DEFAULT_MODE } from "./modes";

export type GovernanceSnapshot = {
  riskScore: number;
  escalationLevel: number;
};

export type ResolveModeOptions = {
  contradictionDetected?: boolean;
  boundarySeverity?: 0 | 1 | 2;
  /** Phase 4: when 4 and escalation < 2, vent/listen → coach. */
  firmnessLevel?: 0 | 1 | 2 | 3 | 4;
};

/**
 * Resolve final VellaMode from optional request and governance state.
 * - escalationLevel >= 2 → force "crisis" (highest priority)
 * - firmnessLevel === 4 && escalation < 2 && (vent | listen) → "coach"
 * - boundarySeverity === 2 → "coach" (de-escalation)
 * - boundarySeverity === 1 && (vent | listen) → "challenge"
 * - contradictionDetected && (listen | null) → "challenge"
 * - riskScore >= 6 && requested "challenge" → "coach"
 * - No requestedMode → DEFAULT_MODE ("listen")
 */
export function resolveMode(
  requestedMode: VellaMode | null,
  governance: GovernanceSnapshot,
  options?: ResolveModeOptions
): VellaMode {
  const { riskScore, escalationLevel } = governance;

  if (escalationLevel >= 2) {
    return "crisis";
  }

  if (
    options?.firmnessLevel === 4 &&
    (requestedMode === "vent" || requestedMode === "listen")
  ) {
    return "coach";
  }

  if (options?.boundarySeverity === 2) {
    return "coach";
  }

  if (
    options?.boundarySeverity === 1 &&
    (requestedMode === "vent" || requestedMode === "listen")
  ) {
    return "challenge";
  }

  if (options?.contradictionDetected && (requestedMode === "listen" || requestedMode == null || (requestedMode as string) === "")) {
    return "challenge";
  }

  if (requestedMode === "challenge" && riskScore >= 6) {
    return "coach";
  }

  if (requestedMode != null && (requestedMode as string) !== "") {
    return requestedMode;
  }

  return DEFAULT_MODE;
}
