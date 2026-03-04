/**
 * System Transition Log — Unit Tests
 * Tests the deterministic transition detection logic.
 * DB-level insert is tested via integration; here we test the pure function.
 */

import { describe, it, expect } from "vitest";
import { detectTransition, type PreviousSystemStatus } from "@/lib/system/recomputeProtocol";
import { getUserExecutionGate, checkBudgetLimits, REASON_CODES } from "@/lib/system/enforcementGate";
import type { ResourceBudget } from "@/lib/system/resourceBudgetEngine";
import type { MasterStateOutput, GovernanceState } from "@/lib/system/masterStateEngine";
import type { PlanEntitlement } from "@/lib/plans/types";

// ─── Transition Detection ───────────────────────────────────────────────────

describe("detectTransition", () => {
  const basePrevious: PreviousSystemStatus = {
    system_phase: "stable",
    top_priority_domain: "none",
    enforcement_mode: "observe",
    constraint_level: "normal",
  };

  it("detects phase change", () => {
    expect(detectTransition(basePrevious, "volatile", "none", "observe")).toBe(true);
  });

  it("detects priority domain change", () => {
    expect(detectTransition(basePrevious, "stable", "health", "observe")).toBe(true);
  });

  it("detects enforcement mode change", () => {
    expect(detectTransition(basePrevious, "stable", "none", "soft")).toBe(true);
  });

  it("returns false when nothing changed", () => {
    expect(detectTransition(basePrevious, "stable", "none", "observe")).toBe(false);
  });

  it("returns false when previous is null (first run)", () => {
    expect(detectTransition(null, "stable", "none", "observe")).toBe(false);
  });

  it("detects multiple changes simultaneously", () => {
    expect(detectTransition(basePrevious, "recovery", "financial", "strict")).toBe(true);
  });

  it("detects overloaded → growth transition", () => {
    const prev: PreviousSystemStatus = {
      system_phase: "overloaded",
      top_priority_domain: "health",
      enforcement_mode: "soft",
      constraint_level: "critical",
    };
    expect(detectTransition(prev, "growth", "none", "observe")).toBe(true);
  });

  it("detects same phase but different priority", () => {
    const prev: PreviousSystemStatus = {
      system_phase: "recovery",
      top_priority_domain: "health",
      enforcement_mode: "strict",
      constraint_level: "normal",
    };
    expect(detectTransition(prev, "recovery", "financial", "strict")).toBe(true);
  });

  it("detects same phase+priority but different enforcement", () => {
    const prev: PreviousSystemStatus = {
      system_phase: "volatile",
      top_priority_domain: "cognitive",
      enforcement_mode: "soft",
      constraint_level: "normal",
    };
    expect(detectTransition(prev, "volatile", "cognitive", "strict")).toBe(true);
  });

  it("no transition when all match exactly", () => {
    const prev: PreviousSystemStatus = {
      system_phase: "growth",
      top_priority_domain: "financial",
      enforcement_mode: "observe",
      constraint_level: "normal",
    };
    expect(detectTransition(prev, "growth", "financial", "observe")).toBe(false);
  });
});

// ─── Budget Enforcement in Gate ─────────────────────────────────────────────

describe("checkBudgetLimits", () => {
  const defaultBudget: ResourceBudget = {
    max_focus_minutes_today: 120,
    max_decision_complexity: 7,
    spending_tolerance_band: 80,
    recovery_required_hours: 4,
    budget_confidence: 80,
    constraint_level: "normal",
    confidence_score: 80,
    sample_size: 5,
    data_freshness_hours: 12,
    is_stale: false,
  };

  it("returns empty when no budget", () => {
    expect(checkBudgetLimits(null, { requested_focus_minutes: 200 })).toEqual([]);
  });

  it("returns empty when no check requested", () => {
    expect(checkBudgetLimits(defaultBudget, null)).toEqual([]);
  });

  it("flags focus budget exceeded", () => {
    const reasons = checkBudgetLimits(defaultBudget, { requested_focus_minutes: 150 });
    expect(reasons).toContain(REASON_CODES.FOCUS_BUDGET_EXCEEDED);
  });

  it("does not flag when focus is within budget", () => {
    const reasons = checkBudgetLimits(defaultBudget, { requested_focus_minutes: 100 });
    expect(reasons).not.toContain(REASON_CODES.FOCUS_BUDGET_EXCEEDED);
  });

  it("flags decision complexity exceeded", () => {
    const reasons = checkBudgetLimits(defaultBudget, { decision_complexity: 9 });
    expect(reasons).toContain(REASON_CODES.DECISION_COMPLEXITY_EXCEEDED);
  });

  it("flags spending budget exceeded", () => {
    const reasons = checkBudgetLimits(defaultBudget, { spending_amount: 100 });
    expect(reasons).toContain(REASON_CODES.SPENDING_BUDGET_EXCEEDED);
  });

  it("flags recovery not satisfied", () => {
    const reasons = checkBudgetLimits(defaultBudget, { recovery_hours_available: 2 });
    expect(reasons).toContain(REASON_CODES.RECOVERY_NOT_SATISFIED);
  });

  it("does not flag recovery when sufficient", () => {
    const reasons = checkBudgetLimits(defaultBudget, { recovery_hours_available: 6 });
    expect(reasons).not.toContain(REASON_CODES.RECOVERY_NOT_SATISFIED);
  });

  it("confidence low still returns reasons (flag-only, not block)", () => {
    const lowConfBudget: ResourceBudget = { ...defaultBudget, budget_confidence: 10, confidence_score: 10 };
    const reasons = checkBudgetLimits(lowConfBudget, { requested_focus_minutes: 200 }, true);
    expect(reasons).toContain(REASON_CODES.FOCUS_BUDGET_EXCEEDED);
  });

  it("multiple budget violations reported together", () => {
    const reasons = checkBudgetLimits(defaultBudget, {
      requested_focus_minutes: 200,
      decision_complexity: 10,
      spending_amount: 200,
    });
    expect(reasons).toContain(REASON_CODES.FOCUS_BUDGET_EXCEEDED);
    expect(reasons).toContain(REASON_CODES.DECISION_COMPLEXITY_EXCEEDED);
    expect(reasons).toContain(REASON_CODES.SPENDING_BUDGET_EXCEEDED);
  });
});

// ─── Enforcement Gate + Budget Integration ──────────────────────────────────

describe("enforcement gate budget integration", () => {
  const proEntitlements: PlanEntitlement = {
    maxMonthlyTokens: 50_000,
    isPaid: true,
    usesAllocationBucket: true,
    enableRealtime: true,
    enableVoiceTTS: false,
    enableAudioVella: false,
    enableArchitect: false,
    enableDeepDive: false,
    enableDeepInsights: false,
    enableGrowthRoadmap: false,
    enableDeepMemory: false,
  };

  function makeMasterState(overrides: Partial<MasterStateOutput> = {}): MasterStateOutput {
    return {
      global_stability_score: 70,
      dominant_risk_domain: "none",
      energy_budget_flag: false,
      overload_flag: false,
      confidence_score: 80,
      sample_size: 5,
      data_freshness_hours: 12,
      is_stale: false,
      ...overrides,
    };
  }

  it("focus budget exceeded blocks canStartFocus", () => {
    const result = getUserExecutionGate({
      governanceState: null,
      masterState: makeMasterState(),
      tokensRemaining: 5000,
      entitlements: proEntitlements,
      systemStatus: {
        global_stability_score: 70,
        system_phase: "stable",
        top_priority_domain: "none",
        urgency_level: 20,
        enforcement_mode: "observe",
        confidence_score: 80,
        sample_size: 5,
        updated_at: new Date().toISOString(),
      },
      budget: {
        max_focus_minutes_today: 60,
        max_decision_complexity: 7,
        spending_tolerance_band: 80,
        recovery_required_hours: 2,
        budget_confidence: 80,
        constraint_level: "normal",
        confidence_score: 80,
        sample_size: 5,
        data_freshness_hours: 12,
        is_stale: false,
      },
      budgetCheck: { requested_focus_minutes: 90 },
    });

    expect(result.canStartFocus).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.FOCUS_BUDGET_EXCEEDED);
  });

  it("confidence low disables strict budget enforcement but still flags", () => {
    const result = getUserExecutionGate({
      governanceState: null,
      masterState: makeMasterState({ confidence_score: 10 }),
      tokensRemaining: 5000,
      entitlements: proEntitlements,
      systemStatus: {
        global_stability_score: 70,
        system_phase: "stable",
        top_priority_domain: "none",
        urgency_level: 20,
        enforcement_mode: "observe",
        confidence_score: 10,
        sample_size: 5,
        updated_at: new Date().toISOString(),
      },
      budget: {
        max_focus_minutes_today: 60,
        max_decision_complexity: 5,
        spending_tolerance_band: 50,
        recovery_required_hours: 4,
        budget_confidence: 10,
        constraint_level: "normal",
        confidence_score: 10,
        sample_size: 5,
        data_freshness_hours: 12,
        is_stale: false,
      },
      budgetCheck: { requested_focus_minutes: 90 },
    });

    expect(result.reasonCodes).toContain(REASON_CODES.LOW_CONFIDENCE_DATA);
    expect(result.reasonCodes).toContain(REASON_CODES.FOCUS_BUDGET_EXCEEDED);
  });
});
