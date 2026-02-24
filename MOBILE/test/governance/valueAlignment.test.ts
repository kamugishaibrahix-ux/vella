/**
 * Phase 7 — Value Alignment tests.
 */
import { describe, it, expect } from "vitest";
import {
  detectValueAlignment,
  VALUE_ALIGNMENT_REASON_CODES,
} from "@/lib/governance/valueAlignment";

const emptySnapshot = {
  riskScore: 0,
  escalationLevel: 0,
  recentCommitmentViolations: 0,
  recentAbstinenceViolations: 0,
  focusSessionsLast7d: 0,
  contradictionDetected: false,
} as Record<string, unknown>;

describe("detectValueAlignment", () => {
  it("alignment: completions high + low violations → alignedValues and VALUES_ALIGNED", () => {
    const r = detectValueAlignment({
      activeValues: ["discipline", "health"],
      violationCounts7d: {
        commitmentViolations7d: 0,
        abstinenceViolations7d: 0,
        commitmentCompleted7d: 4,
      },
      behaviourSnapshot: emptySnapshot,
    });
    expect(r.misalignmentDetected).toBe(false);
    expect(r.alignedValues).toContain("discipline");
    expect(r.alignedValues).toContain("health");
    expect(r.reasons).toContain("VALUES_ALIGNED");
  });

  it("misalignment: discipline + commitmentViolations7d >= 2 → misaligned", () => {
    const r = detectValueAlignment({
      activeValues: ["discipline"],
      violationCounts7d: {
        commitmentViolations7d: 2,
        abstinenceViolations7d: 0,
        commitmentCompleted7d: 0,
      },
      behaviourSnapshot: emptySnapshot,
    });
    expect(r.misalignmentDetected).toBe(true);
    expect(r.misalignedValues).toContain("discipline");
    expect(r.reasons).toContain("DISCIPLINE_VIOLATION");
  });

  it("misalignment: health + abstinenceViolations7d >= 1 → misaligned", () => {
    const r = detectValueAlignment({
      activeValues: ["health"],
      violationCounts7d: {
        commitmentViolations7d: 0,
        abstinenceViolations7d: 1,
        commitmentCompleted7d: 0,
      },
      behaviourSnapshot: emptySnapshot,
    });
    expect(r.misalignmentDetected).toBe(true);
    expect(r.misalignedValues).toContain("health");
    expect(r.reasons).toContain("HEALTH_CONFLICT");
  });

  it("multiple values: mix of aligned and misaligned", () => {
    const r = detectValueAlignment({
      activeValues: ["discipline", "health", "growth"],
      violationCounts7d: {
        commitmentViolations7d: 3,
        abstinenceViolations7d: 0,
        commitmentCompleted7d: 1,
      },
      behaviourSnapshot: emptySnapshot,
    });
    expect(r.misalignmentDetected).toBe(true);
    expect(r.misalignedValues).toContain("discipline");
    expect(r.reasons).toContain("DISCIPLINE_VIOLATION");
  });

  it("no values declared → empty signals", () => {
    const r = detectValueAlignment({
      activeValues: [],
      violationCounts7d: {
        commitmentViolations7d: 2,
        abstinenceViolations7d: 1,
      },
      behaviourSnapshot: emptySnapshot,
    });
    expect(r.misalignmentDetected).toBe(false);
    expect(r.alignedValues).toEqual([]);
    expect(r.misalignedValues).toEqual([]);
    expect(r.reasons).toEqual([]);
  });

  it("reasons from allowlist", () => {
    const r = detectValueAlignment({
      activeValues: ["discipline", "health"],
      violationCounts7d: {
        commitmentViolations7d: 2,
        abstinenceViolations7d: 1,
      },
      behaviourSnapshot: emptySnapshot,
    });
    for (const code of r.reasons) {
      expect(VALUE_ALIGNMENT_REASON_CODES).toContain(code);
    }
  });
});
