/**
 * Phase 1 — Pattern Injection Layer.
 * Builds a per-request behaviour snapshot from governance state and violation counts.
 * Read-only; no writes. No free text. Snapshot must not be logged.
 */

import type { GovernanceStateForUser } from "./readState";
import { computeGuidanceSignals, type GuidanceSignals } from "./guidance";
import { computeIdentitySignals, type IdentitySignals } from "@/lib/ai/identityEngine";
import {
  computeLongitudinalSignals,
  type LongitudinalSignals,
  type ComputeLongitudinalInput,
} from "./trendEngine";
import { detectValueAlignment, type ValueAlignmentSignals } from "./valueAlignment";

export type BehaviourSnapshot = {
  riskScore: number;
  escalationLevel: number;
  recoveryState: string;
  disciplineState: string;
  focusState: string;
  recentCommitmentViolations: number;
  recentAbstinenceViolations: number;
  focusSessionsLast7d: number;
  contradictionDetected: boolean;
  contradictedCommitmentIds: string[];
  boundaryTriggered: boolean;
  boundaryType?: string;
  boundarySeverity?: 1 | 2;
  /** Phase 4: earned validation, firmness, outcome projection. */
  guidanceSignals?: GuidanceSignals;
  /** Phase 5: mood, stance, standards. */
  identitySignals?: IdentitySignals;
  /** Longitudinal: discipline/recovery/focus trends, cycle. */
  longitudinalSignals?: LongitudinalSignals;
  /** Phase 7: value alignment (declared values vs behaviour). */
  valueAlignmentSignals?: ValueAlignmentSignals;
};

export type ContradictionResult = {
  contradictionDetected: boolean;
  contradictedCommitmentIds: string[];
};

/** Phase 3: boundary signal for snapshot. Type and severity only; no matchedTerms or user content. */
export type BoundarySnapshotInput = {
  boundaryTriggered: boolean;
  boundaryType?: "insult" | "hostility" | "degrading" | "threat" | "other";
  boundarySeverity?: 0 | 1 | 2;
};

/** Violation counts for snapshot; commitmentCompleted optional (for guidance). */
export type SnapshotViolationCounts = {
  commitmentViolations: number;
  abstinenceViolations: number;
  commitmentCompleted?: number;
};

/**
 * Build structured behaviour snapshot for prompt injection.
 * All fields are metadata/codes/numbers only. No user content.
 * Optional longitudinalInput: when provided, longitudinalSignals are computed.
 * Optional activeValues: when provided, valueAlignmentSignals are computed (value codes only).
 */
export function buildBehaviourSnapshot(
  governance: GovernanceStateForUser,
  violationCounts: SnapshotViolationCounts,
  focusSessionsLast7d: number,
  contradiction: ContradictionResult,
  boundary: BoundarySnapshotInput,
  longitudinalInput?: ComputeLongitudinalInput | null,
  activeValues?: string[] | null
): BehaviourSnapshot {
  const out: BehaviourSnapshot = {
    riskScore: governance.riskScore,
    escalationLevel: governance.escalationLevel,
    recoveryState: governance.recoveryState,
    disciplineState: governance.disciplineState,
    focusState: governance.focusState,
    recentCommitmentViolations: violationCounts.commitmentViolations,
    recentAbstinenceViolations: violationCounts.abstinenceViolations,
    focusSessionsLast7d,
    contradictionDetected: contradiction.contradictionDetected,
    contradictedCommitmentIds: contradiction.contradictedCommitmentIds,
    boundaryTriggered: boundary.boundaryTriggered,
  };
  if (boundary.boundaryTriggered && boundary.boundaryType != null) {
    out.boundaryType = boundary.boundaryType;
  }
  if (boundary.boundaryTriggered && (boundary.boundarySeverity === 1 || boundary.boundarySeverity === 2)) {
    out.boundarySeverity = boundary.boundarySeverity as 1 | 2;
  }

  const guidance = computeGuidanceSignals({
    riskScore: governance.riskScore,
    escalationLevel: governance.escalationLevel,
    recoveryState: governance.recoveryState,
    disciplineState: governance.disciplineState,
    focusState: governance.focusState,
    violationCounts7d: {
      commitmentViolations7d: violationCounts.commitmentViolations,
      abstinenceViolations7d: violationCounts.abstinenceViolations,
      commitmentCompleted7d: violationCounts.commitmentCompleted ?? 0,
    },
    focusSessionsLast7d,
    contradictionDetected: contradiction.contradictionDetected,
    boundarySeverity: boundary.boundarySeverity ?? 0,
  });
  out.guidanceSignals = guidance;

  const identity = computeIdentitySignals({
    firmnessLevel: guidance.firmnessLevel,
    earnedValidationLevel: guidance.earnedValidation.earnedValidationLevel,
    projectionLevel: guidance.outcomeProjection.projectionLevel,
    boundarySeverity: boundary.boundarySeverity ?? 0,
    contradictionDetected: contradiction.contradictionDetected,
    escalationLevel: governance.escalationLevel,
    riskScore: governance.riskScore,
  });
  out.identitySignals = identity;

  if (longitudinalInput != null) {
    out.longitudinalSignals = computeLongitudinalSignals(longitudinalInput);
  }

  if (activeValues != null && activeValues.length > 0) {
    out.valueAlignmentSignals = detectValueAlignment({
      activeValues,
      violationCounts7d: {
        commitmentViolations7d: violationCounts.commitmentViolations,
        abstinenceViolations7d: violationCounts.abstinenceViolations,
        commitmentCompleted7d: violationCounts.commitmentCompleted ?? 0,
      },
      contradictionDetected: contradiction.contradictionDetected,
      behaviourSnapshot: out,
    });
  }

  return out;
}
