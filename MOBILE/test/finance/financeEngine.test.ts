/**
 * Financial Discipline Engine — Unit Tests
 * Tests deterministic computation functions only (no Supabase).
 */

import { describe, it, expect } from "vitest";
import {
  computeMonthlySpending,
  computeImpulseRate,
  computeSavingsRatio,
  computeFinancialStress,
  evaluateFinancialGovernanceSignal,
  FINANCIAL_GOVERNANCE_WEIGHT,
} from "@/lib/finance/financeEngine";
import type { FinancialStateOutput } from "@/lib/finance/financeEngine";

describe("computeMonthlySpending", () => {
  it("returns 0 for empty entries", () => {
    expect(computeMonthlySpending([])).toBe(0);
  });

  it("sums only expense category entries", () => {
    const entries = [
      { amount: 100, category: "expense" as const },
      { amount: 200, category: "income" as const },
      { amount: 50, category: "expense" as const },
      { amount: 75, category: "savings" as const },
    ];
    expect(computeMonthlySpending(entries)).toBe(150);
  });

  it("handles all-income entries (0 spending)", () => {
    const entries = [
      { amount: 1000, category: "income" as const },
      { amount: 500, category: "savings" as const },
    ];
    expect(computeMonthlySpending(entries)).toBe(0);
  });
});

describe("computeImpulseRate", () => {
  it("returns 0 for empty entries", () => {
    expect(computeImpulseRate([])).toBe(0);
  });

  it("returns 0 when no expenses", () => {
    const entries = [
      { category: "income" as const, behavior_flag: "planned" as const },
    ];
    expect(computeImpulseRate(entries)).toBe(0);
  });

  it("returns 1 when all expenses are impulse", () => {
    const entries = [
      { category: "expense" as const, behavior_flag: "impulse" as const },
      { category: "expense" as const, behavior_flag: "impulse" as const },
    ];
    expect(computeImpulseRate(entries)).toBe(1);
  });

  it("returns 0 when all expenses are planned", () => {
    const entries = [
      { category: "expense" as const, behavior_flag: "planned" as const },
      { category: "expense" as const, behavior_flag: "planned" as const },
    ];
    expect(computeImpulseRate(entries)).toBe(0);
  });

  it("returns correct ratio for mixed", () => {
    const entries = [
      { category: "expense" as const, behavior_flag: "impulse" as const },
      { category: "expense" as const, behavior_flag: "planned" as const },
      { category: "expense" as const, behavior_flag: "planned" as const },
      { category: "expense" as const, behavior_flag: "impulse" as const },
    ];
    expect(computeImpulseRate(entries)).toBe(0.5);
  });

  it("ignores non-expense entries for impulse rate", () => {
    const entries = [
      { category: "income" as const, behavior_flag: "planned" as const },
      { category: "expense" as const, behavior_flag: "impulse" as const },
      { category: "expense" as const, behavior_flag: "planned" as const },
    ];
    expect(computeImpulseRate(entries)).toBe(0.5);
  });
});

describe("computeSavingsRatio", () => {
  it("returns 0 for empty entries", () => {
    expect(computeSavingsRatio([])).toBe(0);
  });

  it("returns 0 when no income or savings", () => {
    const entries = [
      { amount: 100, category: "expense" as const },
    ];
    expect(computeSavingsRatio(entries)).toBe(0);
  });

  it("returns correct ratio for savings vs income", () => {
    const entries = [
      { amount: 800, category: "income" as const },
      { amount: 200, category: "savings" as const },
    ];
    expect(computeSavingsRatio(entries)).toBe(0.2);
  });

  it("caps at 1", () => {
    const entries = [
      { amount: 1000, category: "savings" as const },
    ];
    expect(computeSavingsRatio(entries)).toBe(1);
  });
});

describe("computeFinancialStress", () => {
  it("returns 0 for zero inputs", () => {
    expect(computeFinancialStress(0, 0, 0, 0)).toBe(30);
  });

  it("returns low stress for healthy financial state", () => {
    const stress = computeFinancialStress(500, 0.3, 0.05, 2000);
    expect(stress).toBeLessThan(30);
  });

  it("returns high stress for impulse-heavy, low-savings state", () => {
    const stress = computeFinancialStress(2000, 0.02, 0.8, 1500);
    expect(stress).toBeGreaterThan(70);
  });

  it("increases when impulse rate is high", () => {
    const low = computeFinancialStress(1000, 0.2, 0.1, 2000);
    const high = computeFinancialStress(1000, 0.2, 0.8, 2000);
    expect(high).toBeGreaterThan(low);
  });

  it("increases when savings ratio is low", () => {
    const high = computeFinancialStress(1000, 0.5, 0.2, 2000);
    const low = computeFinancialStress(1000, 0.02, 0.2, 2000);
    expect(low).toBeGreaterThan(high);
  });

  it("non-linear amplification when multiple signals converge", () => {
    const base = computeFinancialStress(2500, 0.05, 0.4, 2000);
    const amplified = computeFinancialStress(2500, 0.05, 0.4, 2000);
    expect(amplified).toBe(base);

    const multiStress = computeFinancialStress(3000, 0.02, 0.5, 1000);
    expect(multiStress).toBeGreaterThan(50);
  });

  it("caps at 100", () => {
    const stress = computeFinancialStress(10000, 0, 1.0, 100);
    expect(stress).toBeLessThanOrEqual(100);
  });

  it("is deterministic", () => {
    const a = computeFinancialStress(1500, 0.15, 0.4, 2000);
    const b = computeFinancialStress(1500, 0.15, 0.4, 2000);
    expect(a).toBe(b);
  });
});

describe("evaluateFinancialGovernanceSignal", () => {
  it("returns null when stress below threshold", () => {
    const state: FinancialStateOutput = {
      monthly_spending: 500,
      impulse_spend_count: 1,
      savings_ratio: 0.3,
      financial_stress_index: FINANCIAL_GOVERNANCE_WEIGHT.stress_threshold - 1,
    };
    expect(evaluateFinancialGovernanceSignal(state)).toBeNull();
  });

  it("fires when stress exceeds threshold", () => {
    const state: FinancialStateOutput = {
      monthly_spending: 3000,
      impulse_spend_count: 10,
      savings_ratio: 0.01,
      financial_stress_index: FINANCIAL_GOVERNANCE_WEIGHT.stress_threshold + 1,
    };
    const signal = evaluateFinancialGovernanceSignal(state);
    expect(signal).not.toBeNull();
    expect(signal!.domain_flag).toBe("financial_instability");
    expect(signal!.risk_increment).toBe(FINANCIAL_GOVERNANCE_WEIGHT.risk_increment);
  });

  it("returns null at exactly the threshold", () => {
    const state: FinancialStateOutput = {
      monthly_spending: 1000,
      impulse_spend_count: 5,
      savings_ratio: 0.1,
      financial_stress_index: FINANCIAL_GOVERNANCE_WEIGHT.stress_threshold,
    };
    expect(evaluateFinancialGovernanceSignal(state)).toBeNull();
  });
});
