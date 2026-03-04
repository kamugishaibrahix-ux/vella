/**
 * Resource Budget Engine — Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  computeFocusBudget,
  computeDecisionComplexityBudget,
  computeSpendingTolerance,
  computeRecoveryHours,
  computeBudgetConfidence,
  computeResourceBudget,
  deriveConstraintLevel,
  BUDGET_CONSTANTS,
  type BudgetInput,
} from "@/lib/system/resourceBudgetEngine";
import type { MasterStateOutput, GovernanceState, HealthState, FinancialState, CognitiveState } from "@/lib/system/masterStateEngine";
import type { SystemPhase } from "@/lib/system/phaseEngine";

// ─── Focus Budget ───────────────────────────────────────────────────────────

describe("computeFocusBudget", () => {
  it("returns full 180 minutes with no debt, no flags, stable phase", () => {
    expect(computeFocusBudget(0, false, false, "stable")).toBe(180);
  });

  it("sleep debt reduces focus budget proportionally", () => {
    const result = computeFocusBudget(50, false, false, "stable");
    expect(result).toBeLessThan(180);
    expect(result).toBe(Math.round(180 - 50 * BUDGET_CONSTANTS.SLEEP_DEBT_FOCUS_FACTOR));
  });

  it("high sleep debt severely reduces focus", () => {
    const result = computeFocusBudget(100, false, false, "stable");
    expect(result).toBeLessThanOrEqual(100);
  });

  it("overload flag halves focus budget", () => {
    const result = computeFocusBudget(0, true, false, "stable");
    expect(result).toBe(Math.round(180 * BUDGET_CONSTANTS.OVERLOAD_FOCUS_MULTIPLIER));
  });

  it("volatility reduces by 25%", () => {
    const result = computeFocusBudget(0, false, true, "stable");
    expect(result).toBe(Math.round(180 * BUDGET_CONSTANTS.VOLATILITY_FOCUS_MULTIPLIER));
  });

  it("recovery phase reduces by 40%", () => {
    const result = computeFocusBudget(0, false, false, "recovery");
    expect(result).toBe(Math.round(180 * BUDGET_CONSTANTS.RECOVERY_FOCUS_MULTIPLIER));
  });

  it("overload + sleep debt compound", () => {
    const withDebt = computeFocusBudget(50, true, false, "stable");
    const noDebt = computeFocusBudget(0, true, false, "stable");
    expect(withDebt).toBeLessThan(noDebt);
  });

  it("never falls below minimum (15 min)", () => {
    const result = computeFocusBudget(100, true, true, "recovery");
    expect(result).toBeGreaterThanOrEqual(BUDGET_CONSTANTS.MIN_FOCUS_MINUTES);
  });

  it("growth phase does not change focus", () => {
    expect(computeFocusBudget(0, false, false, "growth")).toBe(180);
  });
});

// ─── Decision Complexity Budget ─────────────────────────────────────────────

describe("computeDecisionComplexityBudget", () => {
  it("returns 10 with no regret, volatility, high confidence", () => {
    expect(computeDecisionComplexityBudget(0, 0, 80)).toBe(10);
  });

  it("high regret_index reduces complexity budget", () => {
    const result = computeDecisionComplexityBudget(80, 0, 80);
    expect(result).toBeLessThan(10);
    expect(result).toBe(Math.round(10 - 80 * BUDGET_CONSTANTS.REGRET_COMPLEXITY_FACTOR));
  });

  it("high decision volatility reduces complexity", () => {
    const result = computeDecisionComplexityBudget(0, 80, 80);
    expect(result).toBeLessThan(10);
  });

  it("low confidence applies additional penalty", () => {
    const highConf = computeDecisionComplexityBudget(50, 50, 80);
    const lowConf = computeDecisionComplexityBudget(50, 50, 10);
    expect(lowConf).toBe(highConf - BUDGET_CONSTANTS.LOW_CONFIDENCE_COMPLEXITY_PENALTY);
  });

  it("never falls below 1", () => {
    const result = computeDecisionComplexityBudget(100, 100, 0);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("never exceeds 10", () => {
    const result = computeDecisionComplexityBudget(0, 0, 100);
    expect(result).toBeLessThanOrEqual(10);
  });
});

// ─── Spending Tolerance ─────────────────────────────────────────────────────

describe("computeSpendingTolerance", () => {
  it("base tolerance is 100 + savings_ratio", () => {
    const result = computeSpendingTolerance(20, 0, "stable");
    expect(result).toBe(120);
  });

  it("financial stress shrinks the band", () => {
    const noStress = computeSpendingTolerance(20, 0, "stable");
    const highStress = computeSpendingTolerance(20, 80, "stable");
    expect(highStress).toBeLessThan(noStress);
  });

  it("growth phase expands band by 15%", () => {
    const stable = computeSpendingTolerance(20, 0, "stable");
    const growth = computeSpendingTolerance(20, 0, "growth");
    expect(growth).toBeGreaterThan(stable);
    expect(growth).toBeCloseTo(stable * BUDGET_CONSTANTS.GROWTH_SPENDING_BONUS, 0);
  });

  it("never falls below minimum (10)", () => {
    const result = computeSpendingTolerance(0, 100, "recovery");
    expect(result).toBeGreaterThanOrEqual(BUDGET_CONSTANTS.MIN_SPENDING_TOLERANCE);
  });

  it("high savings ratio widens tolerance", () => {
    const lowSavings = computeSpendingTolerance(5, 30, "stable");
    const highSavings = computeSpendingTolerance(40, 30, "stable");
    expect(highSavings).toBeGreaterThan(lowSavings);
  });
});

// ─── Recovery Hours ─────────────────────────────────────────────────────────

describe("computeRecoveryHours", () => {
  it("returns 0 with no debt, no relapse, no overload", () => {
    expect(computeRecoveryHours(0, false, false)).toBe(0);
  });

  it("sleep debt adds proportional hours", () => {
    const result = computeRecoveryHours(50, false, false);
    expect(result).toBe(Math.round(50 * BUDGET_CONSTANTS.SLEEP_DEBT_RECOVERY_FACTOR));
  });

  it("relapse adds 3 bonus hours", () => {
    const noRelapse = computeRecoveryHours(50, false, false);
    const relapse = computeRecoveryHours(50, true, false);
    expect(relapse).toBe(noRelapse + BUDGET_CONSTANTS.RELAPSE_RECOVERY_BONUS);
  });

  it("overload adds 2 bonus hours", () => {
    const noOverload = computeRecoveryHours(50, false, false);
    const overloaded = computeRecoveryHours(50, false, true);
    expect(overloaded).toBe(noOverload + BUDGET_CONSTANTS.OVERLOAD_RECOVERY_BONUS);
  });

  it("caps at 12 hours maximum", () => {
    const result = computeRecoveryHours(100, true, true);
    expect(result).toBeLessThanOrEqual(BUDGET_CONSTANTS.MAX_RECOVERY_HOURS);
  });

  it("relapse + overload compound", () => {
    const relapse = computeRecoveryHours(50, true, false);
    const both = computeRecoveryHours(50, true, true);
    expect(both).toBeGreaterThan(relapse);
  });
});

// ─── Budget Confidence ──────────────────────────────────────────────────────

describe("computeBudgetConfidence", () => {
  it("returns 0 when no domain data", () => {
    expect(computeBudgetConfidence(undefined, undefined, undefined)).toBe(0);
  });

  it("returns minimum of available confidences", () => {
    expect(computeBudgetConfidence(80, 50, 70)).toBe(50);
  });

  it("handles partial domain data", () => {
    expect(computeBudgetConfidence(80, undefined, 70)).toBe(70);
  });

  it("single domain returns that domain's confidence", () => {
    expect(computeBudgetConfidence(60, undefined, undefined)).toBe(60);
  });
});

// ─── Full computeResourceBudget ─────────────────────────────────────────────

describe("computeResourceBudget", () => {
  function makeInput(overrides: Partial<BudgetInput> = {}): BudgetInput {
    return {
      masterState: {
        global_stability_score: 70,
        dominant_risk_domain: "none",
        energy_budget_flag: false,
        overload_flag: false,
        confidence_score: 80,
        sample_size: 5,
        data_freshness_hours: 12,
        is_stale: false,
      },
      governanceState: { state_json: { recovery_state: "ok", governance_risk_score: 2 } },
      systemPhase: "stable",
      healthState: { energy_index: 70, sleep_debt_score: 20, recovery_index: 60, volatility_flag: false, confidence_score: 80 },
      financialState: { monthly_spending: 2000, impulse_spend_count: 3, savings_ratio: 25, financial_stress_index: 30, confidence_score: 80 },
      cognitiveState: { avg_confidence: 7, regret_index: 20, bias_frequency_score: 10, decision_volatility: 15, confidence_score: 80 },
      selectedDomains: [],
      ...overrides,
    };
  }

  it("produces baseline budget for healthy user", () => {
    const budget = computeResourceBudget(makeInput());
    expect(budget.max_focus_minutes_today).toBeGreaterThan(100);
    expect(budget.max_decision_complexity).toBeGreaterThanOrEqual(8);
    expect(budget.spending_tolerance_band).toBeGreaterThan(80);
    expect(budget.recovery_required_hours).toBeLessThanOrEqual(3);
    expect(budget.budget_confidence).toBe(80);
  });

  it("overload halves focus and adds recovery hours", () => {
    const budget = computeResourceBudget(makeInput({
      masterState: { global_stability_score: 30, dominant_risk_domain: "health", energy_budget_flag: true, overload_flag: true, confidence_score: 80, sample_size: 5, data_freshness_hours: 12, is_stale: false },
    }));
    expect(budget.max_focus_minutes_today).toBeLessThanOrEqual(90);
    expect(budget.recovery_required_hours).toBeGreaterThan(0);
  });

  it("relapse adds recovery hours", () => {
    const noRelapse = computeResourceBudget(makeInput());
    const relapse = computeResourceBudget(makeInput({
      governanceState: { state_json: { recovery_state: "relapse", governance_risk_score: 8 } },
    }));
    expect(relapse.recovery_required_hours).toBeGreaterThan(noRelapse.recovery_required_hours);
  });

  it("null health state uses zero defaults", () => {
    const budget = computeResourceBudget(makeInput({ healthState: null }));
    expect(budget.max_focus_minutes_today).toBe(180);
    expect(budget.recovery_required_hours).toBe(0);
  });

  it("null financial state uses zero defaults", () => {
    const budget = computeResourceBudget(makeInput({ financialState: null }));
    expect(budget.spending_tolerance_band).toBe(100);
  });

  it("null cognitive state uses zero defaults", () => {
    const budget = computeResourceBudget(makeInput({ cognitiveState: null }));
    expect(budget.max_decision_complexity).toBe(10);
  });

  it("all null domain state produces max budgets with zero confidence", () => {
    const budget = computeResourceBudget(makeInput({
      masterState: null,
      governanceState: null,
      healthState: null,
      financialState: null,
      cognitiveState: null,
    }));
    expect(budget.max_focus_minutes_today).toBe(180);
    expect(budget.max_decision_complexity).toBe(8);
    expect(budget.budget_confidence).toBe(0);
  });

  it("is idempotent", () => {
    const input = makeInput();
    const a = computeResourceBudget(input);
    const b = computeResourceBudget(input);
    expect(a).toStrictEqual(b);
  });

  it("healthy user yields constraint_level normal", () => {
    const budget = computeResourceBudget(makeInput());
    expect(budget.constraint_level).toBe("normal");
  });

  it("overloaded user yields constraint_level critical", () => {
    const budget = computeResourceBudget(makeInput({
      masterState: { global_stability_score: 20, dominant_risk_domain: "health", energy_budget_flag: true, overload_flag: true, confidence_score: 80, sample_size: 5, data_freshness_hours: 12, is_stale: false },
      systemPhase: "recovery",
      healthState: { energy_index: 20, sleep_debt_score: 80, recovery_index: 20, volatility_flag: true, confidence_score: 60 },
      cognitiveState: { avg_confidence: 10, regret_index: 80, bias_frequency_score: 80, decision_volatility: 90, confidence_score: 20 },
      financialState: { monthly_spending: 5000, impulse_spend_count: 10, savings_ratio: 0, financial_stress_index: 150, confidence_score: 10 },
    }));
    expect(budget.constraint_level).toBe("critical");
  });

  it("recovery phase with sleep debt yields constraint_level constrained", () => {
    const budget = computeResourceBudget(makeInput({
      systemPhase: "recovery",
      healthState: { energy_index: 40, sleep_debt_score: 60, recovery_index: 40, volatility_flag: true, confidence_score: 60 },
    }));
    expect(budget.max_focus_minutes_today).toBeLessThanOrEqual(60);
    expect(budget.constraint_level).toBe("constrained");
  });

  it("propagates confidence_score from masterState", () => {
    const budget = computeResourceBudget(makeInput({
      masterState: { global_stability_score: 70, dominant_risk_domain: "none", energy_budget_flag: false, overload_flag: false, confidence_score: 42, sample_size: 3, data_freshness_hours: 24, is_stale: false },
    }));
    expect(budget.confidence_score).toBe(42);
    expect(budget.sample_size).toBe(3);
    expect(budget.data_freshness_hours).toBe(24);
    expect(budget.is_stale).toBe(false);
  });

  it("null masterState yields is_stale true and confidence_score 0", () => {
    const budget = computeResourceBudget(makeInput({ masterState: null }));
    expect(budget.confidence_score).toBe(0);
    expect(budget.sample_size).toBe(0);
    expect(budget.is_stale).toBe(true);
  });

  it("stale masterState propagates is_stale true", () => {
    const budget = computeResourceBudget(makeInput({
      masterState: { global_stability_score: 70, dominant_risk_domain: "none", energy_budget_flag: false, overload_flag: false, confidence_score: 50, sample_size: 5, data_freshness_hours: 200, is_stale: true },
    }));
    expect(budget.is_stale).toBe(true);
  });
});

// ─── deriveConstraintLevel ──────────────────────────────────────────────────

describe("deriveConstraintLevel", () => {
  it("returns normal for high values", () => {
    expect(deriveConstraintLevel(120, 8, 80)).toBe("normal");
  });

  it("returns critical when focus <= 30", () => {
    expect(deriveConstraintLevel(30, 8, 80)).toBe("critical");
    expect(deriveConstraintLevel(15, 8, 80)).toBe("critical");
  });

  it("returns critical when decision <= 2", () => {
    expect(deriveConstraintLevel(120, 2, 80)).toBe("critical");
    expect(deriveConstraintLevel(120, 1, 80)).toBe("critical");
  });

  it("returns critical when spending <= 10", () => {
    expect(deriveConstraintLevel(120, 8, 10)).toBe("critical");
    expect(deriveConstraintLevel(120, 8, 5)).toBe("critical");
  });

  it("returns constrained when focus <= 60 and > 30", () => {
    expect(deriveConstraintLevel(60, 8, 80)).toBe("constrained");
    expect(deriveConstraintLevel(45, 8, 80)).toBe("constrained");
  });

  it("returns constrained when decision <= 4", () => {
    expect(deriveConstraintLevel(120, 4, 80)).toBe("constrained");
    expect(deriveConstraintLevel(120, 3, 80)).toBe("constrained");
  });

  it("returns constrained when spending <= 20", () => {
    expect(deriveConstraintLevel(120, 8, 20)).toBe("constrained");
    expect(deriveConstraintLevel(120, 8, 15)).toBe("constrained");
  });

  it("boundary: focus 31 with other values high = constrained", () => {
    expect(deriveConstraintLevel(31, 8, 80)).toBe("constrained");
  });

  it("boundary: focus 61, decision 5, spending 21 = normal", () => {
    expect(deriveConstraintLevel(61, 5, 21)).toBe("normal");
  });
});
