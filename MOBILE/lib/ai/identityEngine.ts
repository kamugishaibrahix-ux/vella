/**
 * Phase 5 — Identity Layer v1.
 * Deterministic mood, stance, standards from governance/guidance/boundary.
 * No LLM. No storage. No logs. Fixed reason codes only.
 */

export type VellaMood =
  | "calm"
  | "curious"
  | "encouraged"
  | "disappointed"
  | "protective"
  | "firm"
  | "hurt";

export type VellaStance =
  | "soft_support"
  | "direct_support"
  | "reflective_probe"
  | "reality_check"
  | "boundary_enforce"
  | "grounding";

export type StandardsLevel = 0 | 1 | 2 | 3;

export type IdentitySignals = {
  mood: VellaMood;
  stance: VellaStance;
  standardsLevel: StandardsLevel;
  reasons: string[];
};

/** Allowlisted reason codes. No free text. */
export const IDENTITY_REASON_CODES = [
  "ESCALATION_HIGH",
  "BOUNDARY_SEVERITY_2",
  "BOUNDARY_SEVERITY_1",
  "EARNED_VALIDATION_HIGH",
  "CONTRADICTION_DETECTED",
  "PROJECTION_ELEVATED",
  "FIRMNESS_HIGH",
] as const;

export type IdentityReasonCode = (typeof IDENTITY_REASON_CODES)[number];

export type ComputeIdentityInput = {
  firmnessLevel?: 0 | 1 | 2 | 3 | 4;
  earnedValidationLevel?: 0 | 1 | 2 | 3;
  projectionLevel?: 0 | 1 | 2 | 3;
  boundarySeverity?: 0 | 1 | 2;
  contradictionDetected?: boolean;
  escalationLevel?: number;
  riskScore?: number;
};

function clampStandards(n: number): StandardsLevel {
  if (n <= 0) return 0;
  if (n >= 3) return 3;
  return n as StandardsLevel;
}

export function computeIdentitySignals(input: ComputeIdentityInput): IdentitySignals {
  const {
    firmnessLevel = 0,
    earnedValidationLevel = 0,
    projectionLevel = 0,
    boundarySeverity = 0,
    contradictionDetected = false,
    escalationLevel = 0,
  } = input;

  const reasons: string[] = [];

  // —— StandardsLevel 0..3 ——
  let standardsLevel: StandardsLevel = 0;
  if (boundarySeverity === 2) standardsLevel = 3;
  else if (boundarySeverity === 1) standardsLevel = 2;
  if (contradictionDetected) {
    standardsLevel = clampStandards(standardsLevel + 1);
    reasons.push("CONTRADICTION_DETECTED");
  }
  if (projectionLevel >= 2) {
    standardsLevel = clampStandards(standardsLevel + 1);
    reasons.push("PROJECTION_ELEVATED");
  }
  if (boundarySeverity === 2) reasons.push("BOUNDARY_SEVERITY_2");
  else if (boundarySeverity === 1) reasons.push("BOUNDARY_SEVERITY_1");

  // —— Mood ——
  let mood: VellaMood;
  if (escalationLevel >= 2) {
    mood = "protective";
    reasons.push("ESCALATION_HIGH");
  } else if (boundarySeverity === 2) {
    mood = "hurt";
    if (!reasons.includes("BOUNDARY_SEVERITY_2")) reasons.push("BOUNDARY_SEVERITY_2");
  } else if (boundarySeverity === 1) {
    mood = "firm";
    if (!reasons.includes("BOUNDARY_SEVERITY_1")) reasons.push("BOUNDARY_SEVERITY_1");
  } else if (earnedValidationLevel >= 2) {
    mood = "encouraged";
    reasons.push("EARNED_VALIDATION_HIGH");
  } else if (contradictionDetected) {
    mood = "curious";
    if (!reasons.includes("CONTRADICTION_DETECTED")) reasons.push("CONTRADICTION_DETECTED");
  } else if (projectionLevel >= 2) {
    mood = "disappointed";
    if (!reasons.includes("PROJECTION_ELEVATED")) reasons.push("PROJECTION_ELEVATED");
  } else {
    mood = "calm";
  }

  // —— Stance ——
  let stance: VellaStance;
  if (escalationLevel >= 2) {
    stance = "grounding";
  } else if (boundarySeverity >= 1) {
    stance = "boundary_enforce";
  } else if (contradictionDetected) {
    stance = "reality_check";
  } else if (projectionLevel >= 2) {
    stance = "reflective_probe";
  } else if (firmnessLevel >= 3) {
    stance = "direct_support";
    reasons.push("FIRMNESS_HIGH");
  } else {
    stance = "soft_support";
  }

  return {
    mood,
    stance,
    standardsLevel,
    reasons: Array.from(new Set(reasons)),
  };
}
