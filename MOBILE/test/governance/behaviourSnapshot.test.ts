/**
 * Phase 1 — Pattern Injection Layer tests.
 * Verifies behaviour snapshot shape and buildBehaviourSnapshot.
 */
import { describe, it, expect } from "vitest";
import { buildBehaviourSnapshot } from "@/lib/governance/behaviourSnapshot";
import { EARNED_VALIDATION_REASONS, OUTCOME_PROJECTION_REASONS } from "@/lib/governance/guidance";
import { IDENTITY_REASON_CODES } from "@/lib/ai/identityEngine";
import { LONGITUDINAL_REASON_CODES } from "@/lib/governance/trendEngine";
import { VALUE_ALIGNMENT_REASON_CODES } from "@/lib/governance/valueAlignment";
import type { GovernanceStateForUser } from "@/lib/governance/readState";

describe("buildBehaviourSnapshot", () => {
  const governance: GovernanceStateForUser = {
    riskScore: 5,
    escalationLevel: 1,
    recoveryState: "at_risk",
    disciplineState: "slipping",
    focusState: "idle",
    lastComputedAtIso: new Date().toISOString(),
  };

  const noBoundary = { boundaryTriggered: false };

  it("returns snapshot with all required fields and guidanceSignals", () => {
    const snapshot = buildBehaviourSnapshot(
      governance,
      { commitmentViolations: 2, abstinenceViolations: 1 },
      3,
      { contradictionDetected: false, contradictedCommitmentIds: [] },
      noBoundary
    );
    expect(snapshot.riskScore).toBe(5);
    expect(snapshot.escalationLevel).toBe(1);
    expect(snapshot.recentCommitmentViolations).toBe(2);
    expect(snapshot.recentAbstinenceViolations).toBe(1);
    expect(snapshot.focusSessionsLast7d).toBe(3);
    expect(snapshot.contradictionDetected).toBe(false);
    expect(snapshot.boundaryTriggered).toBe(false);
    expect(snapshot.guidanceSignals).toBeDefined();
    expect(snapshot.guidanceSignals?.firmnessLevel).toBeGreaterThanOrEqual(0);
    expect(snapshot.guidanceSignals?.firmnessLevel).toBeLessThanOrEqual(4);
    expect(snapshot.guidanceSignals?.earnedValidation).toBeDefined();
    expect(snapshot.guidanceSignals?.outcomeProjection).toBeDefined();
    expect(snapshot.identitySignals).toBeDefined();
    expect(snapshot.identitySignals?.mood).toBeDefined();
    expect(snapshot.identitySignals?.stance).toBeDefined();
    expect(typeof snapshot.identitySignals?.standardsLevel).toBe("number");
  });

  it("uses governance state and violation counts", () => {
    const snapshot = buildBehaviourSnapshot(
      { ...governance, riskScore: 0, escalationLevel: 0 },
      { commitmentViolations: 0, abstinenceViolations: 0 },
      0,
      { contradictionDetected: false, contradictedCommitmentIds: [] },
      noBoundary
    );
    expect(snapshot.riskScore).toBe(0);
    expect(snapshot.escalationLevel).toBe(0);
    expect(snapshot.recentCommitmentViolations).toBe(0);
    expect(snapshot.recentAbstinenceViolations).toBe(0);
    expect(snapshot.focusSessionsLast7d).toBe(0);
    expect(snapshot.contradictionDetected).toBe(false);
    expect(snapshot.contradictedCommitmentIds).toEqual([]);
  });

  it("includes contradiction fields without user content", () => {
    const snapshot = buildBehaviourSnapshot(
      governance,
      { commitmentViolations: 0, abstinenceViolations: 0 },
      0,
      { contradictionDetected: true, contradictedCommitmentIds: ["cid-1", "cid-2"] },
      noBoundary
    );
    expect(snapshot.contradictionDetected).toBe(true);
    expect(snapshot.contradictedCommitmentIds).toEqual(["cid-1", "cid-2"]);
    expect(snapshot).not.toHaveProperty("userMessage");
    expect(snapshot).not.toHaveProperty("commitment content");
  });

  it("contains no free text in snapshot values (codes/ids/numbers/booleans only)", () => {
    const snapshot = buildBehaviourSnapshot(
      governance,
      { commitmentViolations: 0, abstinenceViolations: 0 },
      0,
      { contradictionDetected: false, contradictedCommitmentIds: [] },
      noBoundary
    );
    for (const [key, v] of Object.entries(snapshot)) {
      if (
        key === "guidanceSignals" ||
        key === "identitySignals" ||
        key === "longitudinalSignals" ||
        key === "valueAlignmentSignals"
      )
        continue;
      if (key === "contradictedCommitmentIds") {
        expect(Array.isArray(v)).toBe(true);
        (v as string[]).forEach((id) => expect(typeof id === "string" && id.length <= 100).toBe(true));
      } else if (typeof v === "string") {
        expect(v.length).toBeLessThanOrEqual(50);
      } else {
        expect(typeof v === "number" || typeof v === "boolean").toBe(true);
      }
    }
  });

  it("includes boundary fields without user content or matchedTerms", () => {
    const snapshot = buildBehaviourSnapshot(
      governance,
      { commitmentViolations: 0, abstinenceViolations: 0 },
      0,
      { contradictionDetected: false, contradictedCommitmentIds: [] },
      { boundaryTriggered: true, boundaryType: "insult", boundarySeverity: 1 }
    );
    expect(snapshot.boundaryTriggered).toBe(true);
    expect(snapshot.boundaryType).toBe("insult");
    expect(snapshot.boundarySeverity).toBe(1);
    expect(snapshot).not.toHaveProperty("userMessage");
    expect(snapshot).not.toHaveProperty("matchedTerms");
  });

  it("includes guidanceSignals with allowlisted reasons only and no user content", () => {
    const snapshot = buildBehaviourSnapshot(
      governance,
      { commitmentViolations: 2, abstinenceViolations: 0 },
      0,
      { contradictionDetected: true, contradictedCommitmentIds: [] },
      noBoundary
    );
    expect(snapshot.guidanceSignals).toBeDefined();
    for (const r of snapshot.guidanceSignals!.earnedValidation.reasons) {
      expect(EARNED_VALIDATION_REASONS).toContain(r);
    }
    for (const r of snapshot.guidanceSignals!.outcomeProjection.reasons) {
      expect(OUTCOME_PROJECTION_REASONS).toContain(r);
    }
    expect(snapshot).not.toHaveProperty("userMessage");
    expect(snapshot).not.toHaveProperty("matchedTerms");
  });

  it("includes identitySignals with allowlisted reasons only and no user content", () => {
    const snapshot = buildBehaviourSnapshot(
      governance,
      { commitmentViolations: 2, abstinenceViolations: 0 },
      0,
      { contradictionDetected: true, contradictedCommitmentIds: [] },
      noBoundary
    );
    expect(snapshot.identitySignals).toBeDefined();
    for (const r of snapshot.identitySignals!.reasons) {
      expect(IDENTITY_REASON_CODES).toContain(r);
    }
    expect(snapshot).not.toHaveProperty("userMessage");
    expect(snapshot).not.toHaveProperty("matchedTerms");
  });

  it("includes longitudinalSignals when longitudinalInput provided, reasons from allowlist", () => {
    const snapshot = buildBehaviourSnapshot(
      governance,
      { commitmentViolations: 0, abstinenceViolations: 0 },
      0,
      { contradictionDetected: false, contradictedCommitmentIds: [] },
      noBoundary,
      {
        violationCounts30d: { commitmentViolations30d: 0, abstinenceViolations30d: 0 },
        completionCounts30d: { commitmentCompleted30d: 4 },
        focusSessions30d: 2,
        priorTrendSnapshot: [0, 1, 0, 1],
      }
    );
    expect(snapshot.longitudinalSignals).toBeDefined();
    expect(snapshot.longitudinalSignals?.disciplineTrend).toBeDefined();
    expect(snapshot.longitudinalSignals?.cycleDetected).toBeDefined();
    for (const r of snapshot.longitudinalSignals!.reasons) {
      expect(LONGITUDINAL_REASON_CODES).toContain(r);
    }
  });

  it("includes valueAlignmentSignals when activeValues provided, reasons from allowlist", () => {
    const snapshot = buildBehaviourSnapshot(
      governance,
      { commitmentViolations: 2, abstinenceViolations: 0 },
      0,
      { contradictionDetected: false, contradictedCommitmentIds: [] },
      noBoundary,
      undefined,
      ["discipline", "health"]
    );
    expect(snapshot.valueAlignmentSignals).toBeDefined();
    expect(snapshot.valueAlignmentSignals?.misalignmentDetected).toBe(true);
    expect(snapshot.valueAlignmentSignals?.misalignedValues).toContain("discipline");
    for (const r of snapshot.valueAlignmentSignals!.reasons) {
      expect(VALUE_ALIGNMENT_REASON_CODES).toContain(r);
    }
  });
});
