/**
 * Cross-Domain Risk Aggregator — Unit Tests
 * Tests deterministic computation functions only (no Supabase).
 */

import { describe, it, expect } from "vitest";
import {
  computeDomainStress,
  computeGlobalStability,
  findDominantRiskDomain,
  computeOverloadFlag,
  computeEnergyBudgetFlag,
} from "@/lib/system/masterStateEngine";
import type {
  HealthState,
  FinancialState,
  CognitiveState,
  BehaviouralState,
  GovernanceState,
  RiskDomain,
} from "@/lib/system/masterStateEngine";

const healthOk: HealthState = {
  energy_index: 80, sleep_debt_score: 10, recovery_index: 80, volatility_flag: false,
};
const healthBad: HealthState = {
  energy_index: 20, sleep_debt_score: 85, recovery_index: 20, volatility_flag: true,
};
const financeOk: FinancialState = {
  monthly_spending: 1000, impulse_spend_count: 1, savings_ratio: 0.3, financial_stress_index: 15,
};
const financeBad: FinancialState = {
  monthly_spending: 5000, impulse_spend_count: 15, savings_ratio: 0.01, financial_stress_index: 85,
};
const cognitiveOk: CognitiveState = {
  avg_confidence: 7, regret_index: 15, bias_frequency_score: 10, decision_volatility: 10,
};
const cognitiveBad: CognitiveState = {
  avg_confidence: 3, regret_index: 80, bias_frequency_score: 60, decision_volatility: 75,
};
const behaviouralOk: BehaviouralState = {
  state_json: { connection_depth: 8, progress: { journal_count: 10, checkin_count: 5 } },
};
const governanceOk: GovernanceState = {
  state_json: { governance_risk_score: 2, recovery_state: "ok", discipline_state: "on_track" },
};
const governanceBad: GovernanceState = {
  state_json: { governance_risk_score: 8, recovery_state: "relapse", discipline_state: "off_track" },
};

describe("computeDomainStress", () => {
  it("returns all zeros when all inputs null", () => {
    const stress = computeDomainStress(null, null, null, null, null);
    expect(stress.health).toBe(0);
    expect(stress.financial).toBe(0);
    expect(stress.cognitive).toBe(0);
    expect(stress.behavioural).toBe(0);
    expect(stress.governance).toBe(0);
  });

  it("computes low stress for healthy state", () => {
    const stress = computeDomainStress(healthOk, financeOk, cognitiveOk, behaviouralOk, governanceOk);
    expect(stress.health).toBeLessThan(30);
    expect(stress.financial).toBeLessThan(30);
    expect(stress.cognitive).toBeLessThan(30);
    expect(stress.governance).toBeLessThan(30);
  });

  it("computes high stress for bad state", () => {
    const stress = computeDomainStress(healthBad, financeBad, cognitiveBad, null, governanceBad);
    expect(stress.health).toBeGreaterThan(60);
    expect(stress.financial).toBeGreaterThan(60);
    expect(stress.cognitive).toBeGreaterThan(50);
    expect(stress.governance).toBeGreaterThan(60);
  });

  it("bounds all values 0–100", () => {
    const stress = computeDomainStress(healthBad, financeBad, cognitiveBad, behaviouralOk, governanceBad);
    for (const key of Object.keys(stress) as RiskDomain[]) {
      expect(stress[key]).toBeGreaterThanOrEqual(0);
      expect(stress[key]).toBeLessThanOrEqual(100);
    }
  });
});

describe("computeGlobalStability", () => {
  it("returns 100 when all stress is 0", () => {
    const stressMap = { health: 0, financial: 0, cognitive: 0, behavioural: 0, governance: 0, none: 0 };
    expect(computeGlobalStability(stressMap)).toBe(100);
  });

  it("returns 0 when all stress is 100", () => {
    const stressMap = { health: 100, financial: 100, cognitive: 100, behavioural: 100, governance: 100, none: 0 };
    expect(computeGlobalStability(stressMap)).toBe(0);
  });

  it("amplifies stress non-linearly when multiple domains elevated", () => {
    const singleDomain = { health: 70, financial: 0, cognitive: 0, behavioural: 0, governance: 0, none: 0 };
    const multiDomain = { health: 70, financial: 70, cognitive: 70, behavioural: 0, governance: 0, none: 0 };

    const singleStab = computeGlobalStability(singleDomain);
    const multiStab = computeGlobalStability(multiDomain);

    const singleStress = 100 - singleStab;
    const multiStress = 100 - multiStab;
    const linearExpected = (singleStress / 0.25) * 0.70;

    expect(multiStress).toBeGreaterThan(linearExpected * 0.9);
  });

  it("is bounded 0–100", () => {
    const extreme = { health: 100, financial: 100, cognitive: 100, behavioural: 100, governance: 100, none: 0 };
    const score = computeGlobalStability(extreme);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("findDominantRiskDomain", () => {
  it("returns 'none' when all below threshold", () => {
    const stressMap = { health: 30, financial: 40, cognitive: 50, behavioural: 20, governance: 10, none: 0 };
    expect(findDominantRiskDomain(stressMap)).toBe("none");
  });

  it("identifies the highest stress domain above threshold", () => {
    const stressMap = { health: 80, financial: 40, cognitive: 65, behavioural: 20, governance: 10, none: 0 };
    expect(findDominantRiskDomain(stressMap)).toBe("health");
  });

  it("returns financial when it's the dominant stressor", () => {
    const stressMap = { health: 30, financial: 90, cognitive: 40, behavioural: 20, governance: 10, none: 0 };
    expect(findDominantRiskDomain(stressMap)).toBe("financial");
  });
});

describe("computeOverloadFlag", () => {
  it("returns false when fewer than 2 domains elevated", () => {
    const stressMap = { health: 80, financial: 40, cognitive: 30, behavioural: 20, governance: 10, none: 0 };
    expect(computeOverloadFlag(stressMap)).toBe(false);
  });

  it("returns true when 2+ domains elevated", () => {
    const stressMap = { health: 80, financial: 75, cognitive: 30, behavioural: 20, governance: 10, none: 0 };
    expect(computeOverloadFlag(stressMap)).toBe(true);
  });

  it("returns true when all domains elevated", () => {
    const stressMap = { health: 80, financial: 80, cognitive: 80, behavioural: 80, governance: 80, none: 0 };
    expect(computeOverloadFlag(stressMap)).toBe(true);
  });

  it("threshold is > 60 per domain", () => {
    const exactly60 = { health: 60, financial: 60, cognitive: 60, behavioural: 60, governance: 60, none: 0 };
    expect(computeOverloadFlag(exactly60)).toBe(false);

    const above60 = { health: 61, financial: 61, cognitive: 30, behavioural: 20, governance: 10, none: 0 };
    expect(computeOverloadFlag(above60)).toBe(true);
  });
});

describe("computeEnergyBudgetFlag", () => {
  it("returns false when either input is null", () => {
    expect(computeEnergyBudgetFlag(null, financeOk)).toBe(false);
    expect(computeEnergyBudgetFlag(healthOk, null)).toBe(false);
    expect(computeEnergyBudgetFlag(null, null)).toBe(false);
  });

  it("returns false when sleep debt low and financial stress low", () => {
    expect(computeEnergyBudgetFlag(healthOk, financeOk)).toBe(false);
  });

  it("returns true when high sleep debt AND high financial stress", () => {
    expect(computeEnergyBudgetFlag(healthBad, financeBad)).toBe(true);
  });

  it("returns false when only sleep debt is high", () => {
    expect(computeEnergyBudgetFlag(healthBad, financeOk)).toBe(false);
  });

  it("returns false when only financial stress is high", () => {
    expect(computeEnergyBudgetFlag(healthOk, financeBad)).toBe(false);
  });
});

describe("cross-domain amplification", () => {
  it("high sleep debt + high financial stress produces overload", () => {
    const stress = computeDomainStress(healthBad, financeBad, cognitiveOk, behaviouralOk, governanceOk);
    expect(computeOverloadFlag(stress)).toBe(true);
  });

  it("high emotional volatility + high regret flags cognitive instability", () => {
    const stress = computeDomainStress(healthOk, financeOk, cognitiveBad, behaviouralOk, governanceOk);
    expect(stress.cognitive).toBeGreaterThan(50);
  });

  it("multiple domain stressors reduce global stability non-linearly", () => {
    const lowStress = computeDomainStress(healthOk, financeOk, cognitiveOk, behaviouralOk, governanceOk);
    const highStress = computeDomainStress(healthBad, financeBad, cognitiveBad, behaviouralOk, governanceBad);

    const lowStability = computeGlobalStability(lowStress);
    const highStability = computeGlobalStability(highStress);

    expect(lowStability).toBeGreaterThan(70);
    expect(highStability).toBeLessThan(30);
    expect(lowStability - highStability).toBeGreaterThan(40);
  });
});
