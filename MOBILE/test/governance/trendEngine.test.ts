/**
 * Longitudinal Drift Memory — trend engine tests.
 */
import { describe, it, expect } from "vitest";
import {
  computeLongitudinalSignals,
  LONGITUDINAL_REASON_CODES,
} from "@/lib/governance/trendEngine";

describe("computeLongitudinalSignals", () => {
  it("declining: violation trend up (prior snapshot increasing)", () => {
    const r = computeLongitudinalSignals({
      violationCounts30d: { commitmentViolations30d: 2, abstinenceViolations30d: 0 },
      completionCounts30d: { commitmentCompleted30d: 0 },
      focusSessions30d: 0,
      priorTrendSnapshot: [0, 1, 1, 2],
    });
    expect(r.disciplineTrend).toBe("declining");
    expect(r.reasons).toContain("VIOLATION_TREND_UP");
  });

  it("improving: completions high and violations low", () => {
    const r = computeLongitudinalSignals({
      violationCounts30d: { commitmentViolations30d: 0, abstinenceViolations30d: 0 },
      completionCounts30d: { commitmentCompleted30d: 5 },
      focusSessions30d: 4,
    });
    expect(r.disciplineTrend).toBe("improving");
    expect(r.recoveryTrend).toBe("improving");
    expect(r.reasons).toContain("COMPLETION_TREND_UP");
  });

  it("stable: flat counts, no prior snapshot", () => {
    const r = computeLongitudinalSignals({
      violationCounts30d: { commitmentViolations30d: 1, abstinenceViolations30d: 0 },
      completionCounts30d: { commitmentCompleted30d: 1 },
      focusSessions30d: 2,
    });
    expect(r.disciplineTrend).toBe("stable");
    expect(r.recoveryTrend).toBe("stable");
    expect(r.focusTrend).toBe("stable");
    expect(r.cycleDetected).toBe(false);
  });

  it("cyclical detection: alternating pattern in prior snapshot", () => {
    const r = computeLongitudinalSignals({
      violationCounts30d: { commitmentViolations30d: 1, abstinenceViolations30d: 0 },
      completionCounts30d: { commitmentCompleted30d: 0 },
      focusSessions30d: 0,
      priorTrendSnapshot: [3, 0, 3, 0],
    });
    expect(r.disciplineTrend).toBe("cyclical");
    expect(r.cycleDetected).toBe(true);
    expect(r.reasons).toContain("CYCLICAL_PATTERN");
  });

  it("reasons all from allowlist", () => {
    const r = computeLongitudinalSignals({
      violationCounts30d: { commitmentViolations30d: 3, abstinenceViolations30d: 1 },
      completionCounts30d: { commitmentCompleted30d: 0 },
      focusSessions30d: 0,
      priorTrendSnapshot: [1, 0, 1, 0],
    });
    for (const code of r.reasons) {
      expect(LONGITUDINAL_REASON_CODES).toContain(code);
    }
  });

  it("focus drop: zero focus sessions with prior data", () => {
    const r = computeLongitudinalSignals({
      violationCounts30d: { commitmentViolations30d: 0, abstinenceViolations30d: 0 },
      completionCounts30d: { commitmentCompleted30d: 0 },
      focusSessions30d: 0,
      priorTrendSnapshot: [1, 0, 0, 0],
    });
    expect(r.reasons).toContain("FOCUS_DROP_30D");
    expect(r.focusTrend).toBe("declining");
  });

  it("no prior snapshot: uses 30d aggregates only", () => {
    const r = computeLongitudinalSignals({
      violationCounts30d: { commitmentViolations30d: 0, abstinenceViolations30d: 0 },
      completionCounts30d: { commitmentCompleted30d: 4 },
      focusSessions30d: 5,
    });
    expect(r.disciplineTrend).toBe("improving");
    expect(r.cycleDetected).toBe(false);
  });
});
