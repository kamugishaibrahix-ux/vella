/**
 * Phase 4 — Behaviour Guidance Layer.
 * Deterministic earned validation, firmness scaling, outcome projection.
 * No LLM. No storage. No logging. Fixed reason codes only.
 */

export type FirmnessLevel = 0 | 1 | 2 | 3 | 4;

export type EarnedValidation = {
  earnedValidationLevel: 0 | 1 | 2 | 3;
  reasons: string[];
};

export type OutcomeProjection = {
  projectionLevel: 0 | 1 | 2 | 3;
  messageStyle: "gentle" | "direct";
  reasons: string[];
};

export type GuidanceSignals = {
  firmnessLevel: FirmnessLevel;
  earnedValidation: EarnedValidation;
  outcomeProjection: OutcomeProjection;
};

/** Allowlisted reason codes for earned validation. */
export const EARNED_VALIDATION_REASONS = [
  "CONSISTENT_COMPLETIONS_7D",
  "ZERO_VIOLATIONS_7D",
  "FOCUS_ON_TRACK",
] as const;

/** Allowlisted reason codes for outcome projection. */
export const OUTCOME_PROJECTION_REASONS = [
  "REPEATED_VIOLATIONS_7D",
  "ABSTINENCE_VIOLATION_7D",
  "ELEVATED_RISK_SCORE",
  "ESCALATION_RISING",
  "COMMITMENT_CONTRADICTION",
] as const;

export type EarnedValidationReason = (typeof EARNED_VALIDATION_REASONS)[number];
export type OutcomeProjectionReason = (typeof OUTCOME_PROJECTION_REASONS)[number];

export type ComputeGuidanceInput = {
  riskScore: number;
  escalationLevel: number;
  recoveryState?: string | null;
  disciplineState?: string | null;
  focusState?: string | null;
  violationCounts7d?: {
    commitmentViolations7d: number;
    abstinenceViolations7d: number;
    commitmentCompleted7d: number;
  };
  focusSessionsLast7d?: number;
  contradictionDetected?: boolean;
  boundarySeverity?: 0 | 1 | 2;
};

function clampFirmness(n: number): FirmnessLevel {
  if (n <= 0) return 0;
  if (n >= 4) return 4;
  return n as FirmnessLevel;
}

export function computeGuidanceSignals(input: ComputeGuidanceInput): GuidanceSignals {
  const {
    riskScore,
    escalationLevel,
    recoveryState,
    disciplineState,
    focusState,
    violationCounts7d,
    focusSessionsLast7d = 0,
    contradictionDetected = false,
    boundarySeverity = 0,
  } = input;

  const commitmentViolations7d = violationCounts7d?.commitmentViolations7d ?? 0;
  const abstinenceViolations7d = violationCounts7d?.abstinenceViolations7d ?? 0;
  const commitmentCompleted7d = violationCounts7d?.commitmentCompleted7d ?? 0;

  // —— FirmnessLevel 0–4 ——
  let firmnessLevel: FirmnessLevel;
  if (escalationLevel >= 2) {
    firmnessLevel = 4;
  } else {
    let f = 0;
    if (riskScore >= 4) f += 1;
    if (riskScore >= 6) f += 1;
    if (escalationLevel >= 1) f += 1;
    if (contradictionDetected) f += 1;
    if (boundarySeverity === 2) f += 2;
    else if (boundarySeverity === 1) f += 1;
    firmnessLevel = clampFirmness(f);
  }

  // —— EarnedValidation 0–3 (low risk + positive consistency) ——
  const earnedReasons: string[] = [];
  let earnedValidationLevel: 0 | 1 | 2 | 3 = 0;

  const lowRisk = riskScore < 4 && escalationLevel < 1;
  if (lowRisk) {
    if (commitmentCompleted7d >= 3 && commitmentViolations7d === 0) {
      earnedReasons.push("CONSISTENT_COMPLETIONS_7D");
      earnedValidationLevel = 2;
    }
    if (commitmentCompleted7d >= 5 && commitmentViolations7d === 0 && abstinenceViolations7d === 0) {
      earnedReasons.push("ZERO_VIOLATIONS_7D");
      earnedValidationLevel = 3;
    }
    const focusOnTrack =
      (focusState === "on_track" || disciplineState === "on_track") && focusSessionsLast7d >= 4;
    if (focusOnTrack) {
      earnedReasons.push("FOCUS_ON_TRACK");
      if (earnedValidationLevel < 3) earnedValidationLevel = (Math.min(earnedValidationLevel + 1, 3)) as 0 | 1 | 2 | 3;
    }
  }

  const earnedValidation: EarnedValidation = {
    earnedValidationLevel,
    reasons: Array.from(new Set(earnedReasons)),
  };

  // —— OutcomeProjection 0–3 ——
  const projectionReasons: string[] = [];
  let projectionLevel: 0 | 1 | 2 | 3 = 0;

  if (commitmentViolations7d >= 2) {
    projectionReasons.push("REPEATED_VIOLATIONS_7D");
    projectionLevel = 2;
  }
  if (abstinenceViolations7d >= 1) {
    projectionReasons.push("ABSTINENCE_VIOLATION_7D");
    projectionLevel = 2;
  }
  if (escalationLevel >= 1) {
    projectionReasons.push("ESCALATION_RISING");
    if (projectionLevel < 2) projectionLevel = 2;
  }
  if (riskScore >= 7) {
    projectionReasons.push("ELEVATED_RISK_SCORE");
    projectionLevel = 3;
  }
  if (contradictionDetected) {
    projectionReasons.push("COMMITMENT_CONTRADICTION");
    if (projectionLevel < 1) projectionLevel = 1;
  }

  const messageStyle: "gentle" | "direct" = projectionLevel >= 3 ? "direct" : "gentle";

  const outcomeProjection: OutcomeProjection = {
    projectionLevel,
    messageStyle,
    reasons: Array.from(new Set(projectionReasons)),
  };

  return {
    firmnessLevel,
    earnedValidation,
    outcomeProjection,
  };
}
