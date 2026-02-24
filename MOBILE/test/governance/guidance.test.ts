/**
 * Phase 4 — Behaviour Guidance Layer tests.
 */
import { describe, it, expect } from "vitest";
import {
  computeGuidanceSignals,
  EARNED_VALIDATION_REASONS,
  OUTCOME_PROJECTION_REASONS,
} from "@/lib/governance/guidance";

describe("computeGuidanceSignals", () => {
  it("low risk + completions + zero violations → earnedValidationLevel high", () => {
    const r = computeGuidanceSignals({
      riskScore: 2,
      escalationLevel: 0,
      violationCounts7d: {
        commitmentViolations7d: 0,
        abstinenceViolations7d: 0,
        commitmentCompleted7d: 5,
      },
      focusSessionsLast7d: 0,
    });
    expect(r.earnedValidation.earnedValidationLevel).toBeGreaterThanOrEqual(2);
    expect(r.earnedValidation.reasons).toContain("ZERO_VIOLATIONS_7D");
    expect(r.earnedValidation.reasons).toContain("CONSISTENT_COMPLETIONS_7D");
  });

  it("higher risk + violations → projectionLevel higher", () => {
    const r = computeGuidanceSignals({
      riskScore: 8,
      escalationLevel: 1,
      violationCounts7d: {
        commitmentViolations7d: 3,
        abstinenceViolations7d: 1,
        commitmentCompleted7d: 0,
      },
    });
    expect(r.outcomeProjection.projectionLevel).toBeGreaterThanOrEqual(2);
    expect(r.outcomeProjection.reasons).toContain("REPEATED_VIOLATIONS_7D");
    expect(r.outcomeProjection.reasons).toContain("ABSTINENCE_VIOLATION_7D");
    expect(r.outcomeProjection.reasons).toContain("ELEVATED_RISK_SCORE");
    expect(r.outcomeProjection.reasons).toContain("ESCALATION_RISING");
    expect(r.outcomeProjection.projectionLevel).toBe(3);
    expect(r.outcomeProjection.messageStyle).toBe("direct");
  });

  it("boundarySeverity 2 → firmnessLevel higher", () => {
    const r = computeGuidanceSignals({
      riskScore: 0,
      escalationLevel: 0,
      boundarySeverity: 2,
    });
    expect(r.firmnessLevel).toBe(2); // +2 for boundary 2
  });

  it("escalationLevel >= 2 → firmnessLevel forced to 4", () => {
    expect(
      computeGuidanceSignals({ riskScore: 0, escalationLevel: 2 }).firmnessLevel
    ).toBe(4);
    expect(
      computeGuidanceSignals({ riskScore: 0, escalationLevel: 3 }).firmnessLevel
    ).toBe(4);
  });

  it("contradictionDetected toggles firmness and projection", () => {
    const without = computeGuidanceSignals({
      riskScore: 0,
      escalationLevel: 0,
      contradictionDetected: false,
    });
    const withContradiction = computeGuidanceSignals({
      riskScore: 0,
      escalationLevel: 0,
      contradictionDetected: true,
    });
    expect(withContradiction.firmnessLevel).toBeGreaterThan(without.firmnessLevel);
    expect(withContradiction.outcomeProjection.reasons).toContain("COMMITMENT_CONTRADICTION");
    expect(withContradiction.outcomeProjection.projectionLevel).toBeGreaterThanOrEqual(1);
  });

  it("earnedValidation reasons are from allowlisted set", () => {
    const r = computeGuidanceSignals({
      riskScore: 0,
      escalationLevel: 0,
      focusState: "on_track",
      focusSessionsLast7d: 5,
      violationCounts7d: {
        commitmentViolations7d: 0,
        abstinenceViolations7d: 0,
        commitmentCompleted7d: 4,
      },
    });
    for (const reason of r.earnedValidation.reasons) {
      expect(EARNED_VALIDATION_REASONS).toContain(reason);
    }
  });

  it("outcomeProjection reasons are from allowlisted set", () => {
    const r = computeGuidanceSignals({
      riskScore: 8,
      escalationLevel: 1,
      contradictionDetected: true,
      violationCounts7d: {
        commitmentViolations7d: 2,
        abstinenceViolations7d: 1,
        commitmentCompleted7d: 0,
      },
    });
    for (const reason of r.outcomeProjection.reasons) {
      expect(OUTCOME_PROJECTION_REASONS).toContain(reason);
    }
  });
});
