/**
 * Session Proposal Detector — Deterministic detection of contract-worthy patterns.
 * Pure function. No DB writes. No LLM.
 * Returns a PendingProposal when session signals warrant a contract, or null.
 */

import type { PendingProposal } from "./negotiationState";
import type { FocusDomain } from "@/lib/focusAreas";

// ---------------------------------------------------------------------------
// Input (all from existing session route data)
// ---------------------------------------------------------------------------

export type ProposalDetectionInput = {
  /** From behaviourSnapshot */
  contradictionDetected: boolean;
  recentCommitmentViolations: number;
  recentAbstinenceViolations: number;
  riskScore: number;
  escalationLevel: number;

  /** From system_status_current (nullable — may not exist) */
  topPriorityDomain: string | null;
  urgencyLevel: number | null;
  enforcementMode: string | null;

  /** User's selected focus domains (FocusDomain[]) */
  selectedDomains: FocusDomain[];
};

// ---------------------------------------------------------------------------
// Domain mapping: system Domain → FocusDomain
// ---------------------------------------------------------------------------

const SYSTEM_TO_FOCUS_DOMAIN: Record<string, FocusDomain> = {
  health: "physical-health",
  finance: "financial-discipline",
  cognitive: "emotional-intelligence",
  performance: "performance-focus",
  recovery: "self-mastery",
  addiction: "addiction-recovery",
  relationships: "relationships",
  identity: "identity-purpose",
};

// ---------------------------------------------------------------------------
// Severity derivation (same logic as contractOrchestrator)
// ---------------------------------------------------------------------------

function deriveSeverity(urgencyLevel: number): "low" | "moderate" | "high" {
  if (urgencyLevel >= 80) return "high";
  if (urgencyLevel >= 50) return "moderate";
  return "low";
}

// ---------------------------------------------------------------------------
// Duration suggestion based on severity
// ---------------------------------------------------------------------------

function suggestDuration(severity: "low" | "moderate" | "high"): number {
  if (severity === "high") return 3;
  if (severity === "moderate") return 5;
  return 7;
}

// ---------------------------------------------------------------------------
// Budget weight suggestion based on severity
// ---------------------------------------------------------------------------

function suggestBudgetWeight(severity: "low" | "moderate" | "high"): number {
  if (severity === "high") return 4;
  if (severity === "moderate") return 3;
  return 2;
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * Detect if session signals warrant a contract proposal.
 * Returns PendingProposal or null. No side effects.
 *
 * Triggers (any one sufficient):
 * - contradictionDetected === true
 * - recentCommitmentViolations >= 2
 * - recentAbstinenceViolations >= 1
 * - riskScore >= 60
 *
 * Blocks (returns null):
 * - enforcementMode === "observe"
 * - No selected domains
 * - No system status
 */
export function detectProposal(
  input: ProposalDetectionInput,
): PendingProposal | null {
  // Block: observe mode does not produce proposals
  if (input.enforcementMode === "observe") return null;

  // Block: no selected domains
  if (input.selectedDomains.length === 0) return null;

  // Check triggers
  const triggered =
    input.contradictionDetected ||
    input.recentCommitmentViolations >= 2 ||
    input.recentAbstinenceViolations >= 1 ||
    input.riskScore >= 60;

  if (!triggered) return null;

  // Resolve domain
  let focusDomain: FocusDomain | null = null;

  if (input.topPriorityDomain) {
    const mapped = SYSTEM_TO_FOCUS_DOMAIN[input.topPriorityDomain];
    if (mapped && input.selectedDomains.includes(mapped)) {
      focusDomain = mapped;
    }
  }

  // Fallback: first selected domain
  if (!focusDomain) {
    focusDomain = input.selectedDomains[0];
  }

  // Derive severity from urgency level (default 50 if missing)
  const severity = deriveSeverity(input.urgencyLevel ?? 50);

  return {
    domain: focusDomain,
    severity,
    suggestedDurationDays: suggestDuration(severity),
    suggestedBudgetWeight: suggestBudgetWeight(severity),
    createdAt: new Date().toISOString(),
  };
}
