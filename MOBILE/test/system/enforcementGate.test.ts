/**
 * Enforcement Gate — Unit Tests
 * Tests canonical enforcement decisions.
 */

import { describe, it, expect } from "vitest";
import {
  getUserExecutionGate,
  isEnforcementReliable,
  checkConstraintLevelRules,
  REASON_CODES,
} from "@/lib/system/enforcementGate";
import type { EnforcementInput } from "@/lib/system/enforcementGate";
import type { ResourceBudget } from "@/lib/system/resourceBudgetEngine";
import type { MasterStateOutput, GovernanceState } from "@/lib/system/masterStateEngine";
import type { PlanEntitlement } from "@/lib/plans/types";

const freeEntitlements: PlanEntitlement = {
  maxMonthlyTokens: 10_000,
  isPaid: false,
  usesAllocationBucket: false,
  enableRealtime: false,
  enableVoiceTTS: false,
  enableAudioVella: false,
  enableArchitect: false,
  enableDeepDive: false,
  enableDeepInsights: false,
  enableGrowthRoadmap: false,
  enableDeepMemory: false,
};

const proEntitlements: PlanEntitlement = {
  ...freeEntitlements,
  isPaid: true,
  usesAllocationBucket: true,
  enableRealtime: true,
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

function makeGovernanceState(overrides: Partial<GovernanceState["state_json"]> = {}): GovernanceState {
  return {
    state_json: {
      governance_risk_score: 2,
      recovery_state: "ok",
      discipline_state: "on_track",
      focus_state: "active",
      escalation_level: 0,
      ...overrides,
    },
  };
}

function makeFreshSystemStatus() {
  return {
    global_stability_score: 70,
    system_phase: "stable",
    top_priority_domain: "none",
    urgency_level: 20,
    enforcement_mode: "observe",
    confidence_score: 80,
    sample_size: 5,
    updated_at: new Date().toISOString(),
  };
}

function makeInput(overrides: Partial<EnforcementInput> = {}): EnforcementInput {
  return {
    governanceState: makeGovernanceState(),
    masterState: makeMasterState(),
    tokensRemaining: 5000,
    entitlements: proEntitlements,
    systemStatus: makeFreshSystemStatus(),
    ...overrides,
  };
}

describe("getUserExecutionGate", () => {
  // ─── Baseline ──────────────────────────────────────────────────────────
  it("allows everything for healthy user with tokens", () => {
    const result = getUserExecutionGate(makeInput());
    expect(result.canSend).toBe(true);
    expect(result.canStartFocus).toBe(true);
    expect(result.canAccessPremium).toBe(true);
    expect(result.reasonCodes).toHaveLength(0);
  });

  // ─── Rule 1: Token depletion ──────────────────────────────────────────
  it("blocks canSend when tokens depleted", () => {
    const result = getUserExecutionGate(makeInput({ tokensRemaining: 0 }));
    expect(result.canSend).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.TOKENS_DEPLETED);
  });

  it("blocks canSend for negative token balance", () => {
    const result = getUserExecutionGate(makeInput({ tokensRemaining: -100 }));
    expect(result.canSend).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.TOKENS_DEPLETED);
  });

  it("allows canSend with 1 token remaining", () => {
    const result = getUserExecutionGate(makeInput({ tokensRemaining: 1 }));
    expect(result.canSend).toBe(true);
  });

  // ─── Rule 2: Overload ─────────────────────────────────────────────────
  it("blocks canStartFocus when overload_flag is true", () => {
    const result = getUserExecutionGate(makeInput({
      masterState: makeMasterState({ overload_flag: true }),
    }));
    expect(result.canStartFocus).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.OVERLOAD_ACTIVE);
  });

  it("still allows canSend during overload", () => {
    const result = getUserExecutionGate(makeInput({
      masterState: makeMasterState({ overload_flag: true }),
    }));
    expect(result.canSend).toBe(true);
  });

  // ─── Rule 3: Low confidence ───────────────────────────────────────────
  it("flags low confidence but does NOT hard-block", () => {
    const result = getUserExecutionGate(makeInput({
      masterState: makeMasterState({ confidence_score: 10 }),
    }));
    expect(result.canSend).toBe(true);
    expect(result.canStartFocus).toBe(true);
    expect(result.reasonCodes).toContain(REASON_CODES.LOW_CONFIDENCE_DATA);
  });

  it("does not flag when confidence is sufficient", () => {
    const result = getUserExecutionGate(makeInput({
      masterState: makeMasterState({ confidence_score: 80 }),
    }));
    expect(result.reasonCodes).not.toContain(REASON_CODES.LOW_CONFIDENCE_DATA);
  });

  // ─── Rule 4: Stale data ───────────────────────────────────────────────
  it("flags stale data", () => {
    const result = getUserExecutionGate(makeInput({
      masterState: makeMasterState({ is_stale: true }),
    }));
    expect(result.reasonCodes).toContain(REASON_CODES.STALE_DATA);
  });

  // ─── Rule 5: Relapse ──────────────────────────────────────────────────
  it("blocks canStartFocus on relapse when confidence is sufficient", () => {
    const result = getUserExecutionGate(makeInput({
      governanceState: makeGovernanceState({ recovery_state: "relapse" }),
      masterState: makeMasterState({ confidence_score: 80 }),
    }));
    expect(result.canStartFocus).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.RELAPSE_STATE);
  });

  it("does NOT block on relapse when confidence is low (avoid false positives)", () => {
    const result = getUserExecutionGate(makeInput({
      governanceState: makeGovernanceState({ recovery_state: "relapse" }),
      masterState: makeMasterState({ confidence_score: 10 }),
    }));
    expect(result.reasonCodes).not.toContain(REASON_CODES.RELAPSE_STATE);
    expect(result.reasonCodes).toContain(REASON_CODES.LOW_CONFIDENCE_DATA);
  });

  // ─── Rule 6: Entitlements ─────────────────────────────────────────────
  it("gates premium access for free users", () => {
    const result = getUserExecutionGate(makeInput({
      entitlements: freeEntitlements,
    }));
    expect(result.canAccessPremium).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.NOT_PAID);
  });

  it("allows premium access for paid users", () => {
    const result = getUserExecutionGate(makeInput({
      entitlements: proEntitlements,
    }));
    expect(result.canAccessPremium).toBe(true);
    expect(result.reasonCodes).not.toContain(REASON_CODES.NOT_PAID);
  });

  // ─── Null state handling ──────────────────────────────────────────────
  it("handles null masterState gracefully", () => {
    const result = getUserExecutionGate(makeInput({
      masterState: null,
    }));
    expect(result.canSend).toBe(true);
    expect(result.reasonCodes).toContain(REASON_CODES.LOW_CONFIDENCE_DATA);
  });

  it("handles null governanceState gracefully", () => {
    const result = getUserExecutionGate(makeInput({
      governanceState: null,
    }));
    expect(result.canSend).toBe(true);
    expect(result.canStartFocus).toBe(true);
  });

  // ─── Compound scenarios ───────────────────────────────────────────────
  it("applies multiple rules simultaneously", () => {
    const result = getUserExecutionGate(makeInput({
      tokensRemaining: 0,
      masterState: makeMasterState({ overload_flag: true }),
      entitlements: freeEntitlements,
    }));
    expect(result.canSend).toBe(false);
    expect(result.canStartFocus).toBe(false);
    expect(result.canAccessPremium).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.TOKENS_DEPLETED);
    expect(result.reasonCodes).toContain(REASON_CODES.OVERLOAD_ACTIVE);
    expect(result.reasonCodes).toContain(REASON_CODES.NOT_PAID);
  });
});

// ─── Constraint-Level-Aware Budget Rules ─────────────────────────────────────

function makeBaseBudget(overrides: Partial<ResourceBudget> = {}): ResourceBudget {
  return {
    max_focus_minutes_today: 120,
    max_decision_complexity: 7,
    spending_tolerance_band: 80,
    recovery_required_hours: 2,
    budget_confidence: 80,
    constraint_level: "normal",
    confidence_score: 80,
    sample_size: 5,
    data_freshness_hours: 12,
    is_stale: false,
    ...overrides,
  };
}

describe("checkConstraintLevelRules", () => {
  it("returns empty when no budget", () => {
    expect(checkConstraintLevelRules(null, { requested_focus_minutes: 60 })).toEqual([]);
  });

  it("BUDGET_CRITICAL when critical + focus > 30 min", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ constraint_level: "critical" }),
      { requested_focus_minutes: 60 },
    );
    expect(reasons).toContain(REASON_CODES.BUDGET_CRITICAL);
  });

  it("no BUDGET_CRITICAL when constraint_level is normal", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ constraint_level: "normal" }),
      { requested_focus_minutes: 60 },
    );
    expect(reasons).not.toContain(REASON_CODES.BUDGET_CRITICAL);
  });

  it("no BUDGET_CRITICAL when critical but focus <= 30", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ constraint_level: "critical" }),
      { requested_focus_minutes: 30 },
    );
    expect(reasons).not.toContain(REASON_CODES.BUDGET_CRITICAL);
  });

  it("constrained level does not produce BUDGET_CRITICAL", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ constraint_level: "constrained" }),
      { requested_focus_minutes: 120 },
    );
    expect(reasons).not.toContain(REASON_CODES.BUDGET_CRITICAL);
  });

  it("DECISION_BUDGET_LOW when max < 3 and requested > max", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ max_decision_complexity: 2 }),
      { decision_complexity: 5 },
    );
    expect(reasons).toContain(REASON_CODES.DECISION_BUDGET_LOW);
  });

  it("no DECISION_BUDGET_LOW when max >= 3", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ max_decision_complexity: 3 }),
      { decision_complexity: 5 },
    );
    expect(reasons).not.toContain(REASON_CODES.DECISION_BUDGET_LOW);
  });

  it("SPENDING_BAND_TIGHT when spending_tolerance_band <= 10 and spending requested", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ spending_tolerance_band: 10 }),
      { spending_amount: 5 },
    );
    expect(reasons).toContain(REASON_CODES.SPENDING_BAND_TIGHT);
  });

  it("no SPENDING_BAND_TIGHT when band > 10", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ spending_tolerance_band: 11 }),
      { spending_amount: 5 },
    );
    expect(reasons).not.toContain(REASON_CODES.SPENDING_BAND_TIGHT);
  });

  it("multiple constraint codes combine correctly", () => {
    const reasons = checkConstraintLevelRules(
      makeBaseBudget({ constraint_level: "critical", max_decision_complexity: 1, spending_tolerance_band: 5 }),
      { requested_focus_minutes: 60, decision_complexity: 5, spending_amount: 1 },
    );
    expect(reasons).toContain(REASON_CODES.BUDGET_CRITICAL);
    expect(reasons).toContain(REASON_CODES.DECISION_BUDGET_LOW);
    expect(reasons).toContain(REASON_CODES.SPENDING_BAND_TIGHT);
  });

  it("null budget check returns empty", () => {
    expect(checkConstraintLevelRules(makeBaseBudget({ constraint_level: "critical" }), null)).toEqual([]);
  });
});

describe("enforcement gate constraint-level integration", () => {
  it("BUDGET_CRITICAL blocks canStartFocus in full gate", () => {
    const result = getUserExecutionGate(makeInput({
      budget: makeBaseBudget({ constraint_level: "critical" }),
      budgetCheck: { requested_focus_minutes: 60 },
    }));
    expect(result.canStartFocus).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.BUDGET_CRITICAL);
  });

  it("DECISION_BUDGET_LOW blocks canStartFocus in full gate", () => {
    const result = getUserExecutionGate(makeInput({
      budget: makeBaseBudget({ max_decision_complexity: 2 }),
      budgetCheck: { decision_complexity: 5 },
    }));
    expect(result.canStartFocus).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODES.DECISION_BUDGET_LOW);
  });
});

describe("isEnforcementReliable", () => {
  it("returns false for null state", () => {
    expect(isEnforcementReliable(null)).toBe(false);
  });

  it("returns false for stale data", () => {
    expect(isEnforcementReliable(makeMasterState({ is_stale: true }))).toBe(false);
  });

  it("returns false for low confidence", () => {
    expect(isEnforcementReliable(makeMasterState({ confidence_score: 10 }))).toBe(false);
  });

  it("returns true for fresh high-confidence data", () => {
    expect(isEnforcementReliable(makeMasterState({ confidence_score: 80, is_stale: false }))).toBe(true);
  });
});
