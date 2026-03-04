/**
 * Recompute Protocol — Unit Tests
 * Tests the pure computation path of the recompute protocol
 * by validating the phase engine + priority engine integration.
 * DB-dependent parts (Supabase reads/writes) are tested via
 * the domain engine tests and integration tests separately.
 *
 * Here we verify:
 *   - Phase + priority correctly derive from domain states
 *   - Enforcement invariant: outdated system_status triggers LOW_SYSTEM_SYNC
 *   - Idempotency of pure computation functions
 */

import { describe, it, expect } from "vitest";
import { computeSystemPhase, type PhaseInput } from "@/lib/system/phaseEngine";
import { computePriority, type PriorityInput } from "@/lib/system/priorityEngine";
import {
  getUserExecutionGate,
  isSystemStatusOutdated,
  REASON_CODES,
  type SystemStatusSnapshot,
} from "@/lib/system/enforcementGate";
import {
  computeDomainStress,
  computeGlobalStability,
  computeOverloadFlag,
  computeEnergyBudgetFlag,
  computeMasterConfidence,
  type HealthState,
  type FinancialState,
  type CognitiveState,
  type BehaviouralState,
  type GovernanceState,
  type MasterStateOutput,
} from "@/lib/system/masterStateEngine";
import { computeDomainWeights } from "@/lib/system/focusWeights";
import type { FocusDomain } from "@/lib/focusAreas";
import type { PlanEntitlement } from "@/lib/plans/types";

const defaultEntitlements: PlanEntitlement = {
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

// ─── Full recompute pipeline (pure path) ────────────────────────────────────

describe("recompute pipeline (pure)", () => {
  function runPipeline(params: {
    health: HealthState | null;
    financial: FinancialState | null;
    cognitive: CognitiveState | null;
    behavioural: BehaviouralState | null;
    governance: GovernanceState | null;
    selectedDomains: FocusDomain[];
  }) {
    const { health, financial, cognitive, behavioural, governance, selectedDomains } = params;

    const focusWeights = selectedDomains.length > 0
      ? computeDomainWeights(selectedDomains)
      : undefined;

    const stressMap = computeDomainStress(health, financial, cognitive, behavioural, governance);
    const global_stability_score = computeGlobalStability(stressMap, focusWeights);
    const overload_flag = computeOverloadFlag(stressMap);
    const energy_budget_flag = computeEnergyBudgetFlag(health, financial);
    const masterConfidence = computeMasterConfidence(health, financial, cognitive);

    const masterState: MasterStateOutput = {
      global_stability_score,
      dominant_risk_domain: "none",
      energy_budget_flag,
      overload_flag,
      ...masterConfidence,
    };

    const healthVolatility = health?.volatility_flag ?? false;
    const cognitiveVolatility = cognitive ? cognitive.decision_volatility > 50 : false;

    const phaseInput: PhaseInput = {
      overload_flag,
      global_stability_score,
      dominant_risk_domain: masterState.dominant_risk_domain,
      governance_risk_score: governance?.state_json?.governance_risk_score ?? 0,
      recovery_state: governance?.state_json?.recovery_state ?? null,
      volatility_flags: {
        health_volatility: healthVolatility,
        cognitive_volatility: cognitiveVolatility,
      },
      confidence_score: masterConfidence.confidence_score,
    };

    const systemPhase = computeSystemPhase(phaseInput);

    const priority = computePriority({
      masterState,
      governanceState: governance,
      selectedDomains,
      entitlements: defaultEntitlements,
      systemPhase,
      domainStress: stressMap,
    });

    return { masterState, systemPhase, priority, stressMap };
  }

  it("relapse overrides performance priority", () => {
    const result = runPipeline({
      health: { energy_index: 80, sleep_debt_score: 20, recovery_index: 70, volatility_flag: false, confidence_score: 80 },
      financial: { monthly_spending: 1000, impulse_spend_count: 2, savings_ratio: 30, financial_stress_index: 20, confidence_score: 80 },
      cognitive: { avg_confidence: 7, regret_index: 15, bias_frequency_score: 10, decision_volatility: 20, confidence_score: 80 },
      behavioural: null,
      governance: { state_json: { governance_risk_score: 8, recovery_state: "relapse" } },
      selectedDomains: ["physical-health"],
    });

    expect(result.systemPhase).toBe("recovery");
    expect(result.priority.intervention_type).toBe("recovery_support");
    expect(result.priority.enforcement_mode).toBe("strict");
  });

  it("overload suppresses focus domain", () => {
    const result = runPipeline({
      health: { energy_index: 20, sleep_debt_score: 90, recovery_index: 15, volatility_flag: true, confidence_score: 80 },
      financial: { monthly_spending: 5000, impulse_spend_count: 15, savings_ratio: 5, financial_stress_index: 85, confidence_score: 80 },
      cognitive: { avg_confidence: 3, regret_index: 75, bias_frequency_score: 60, decision_volatility: 70, confidence_score: 80 },
      behavioural: null,
      governance: { state_json: { governance_risk_score: 5, recovery_state: "ok" } },
      selectedDomains: ["physical-health", "financial-discipline"],
    });

    expect(result.systemPhase).toBe("overloaded");
    expect(result.priority.intervention_type).toBe("overload_pause");
    expect(result.priority.enforcement_mode).toBe("soft");
  });

  it("high financial stress shifts dominant risk to financial", () => {
    const result = runPipeline({
      health: { energy_index: 70, sleep_debt_score: 30, recovery_index: 60, volatility_flag: false, confidence_score: 80 },
      financial: { monthly_spending: 8000, impulse_spend_count: 20, savings_ratio: 2, financial_stress_index: 90, confidence_score: 80 },
      cognitive: { avg_confidence: 7, regret_index: 20, bias_frequency_score: 10, decision_volatility: 15, confidence_score: 80 },
      behavioural: null,
      governance: { state_json: { governance_risk_score: 2, recovery_state: "ok" } },
      selectedDomains: ["financial-discipline"],
    });

    expect(result.stressMap.financial).toBeGreaterThan(result.stressMap.health);
    expect(result.stressMap.financial).toBeGreaterThan(result.stressMap.cognitive);
  });

  it("growth phase only when stability high", () => {
    const result = runPipeline({
      health: { energy_index: 85, sleep_debt_score: 10, recovery_index: 80, volatility_flag: false, confidence_score: 80 },
      financial: { monthly_spending: 500, impulse_spend_count: 1, savings_ratio: 40, financial_stress_index: 10, confidence_score: 80 },
      cognitive: { avg_confidence: 8, regret_index: 5, bias_frequency_score: 5, decision_volatility: 10, confidence_score: 80 },
      behavioural: null,
      governance: { state_json: { governance_risk_score: 1, recovery_state: "ok" } },
      selectedDomains: [],
    });

    expect(result.masterState.global_stability_score).toBeGreaterThanOrEqual(75);
    expect(result.systemPhase).toBe("growth");
  });

  it("stale domain does not influence priority (low confidence → observe)", () => {
    const result = runPipeline({
      health: { energy_index: 20, sleep_debt_score: 90, recovery_index: 10, volatility_flag: true, confidence_score: 0 },
      financial: null,
      cognitive: null,
      behavioural: null,
      governance: { state_json: { governance_risk_score: 2, recovery_state: "ok" } },
      selectedDomains: ["physical-health"],
    });

    expect(result.masterState.confidence_score).toBe(0);
    expect(result.priority.urgency_level).toBe(0);
    expect(result.priority.intervention_type).toBe("none");
    expect(result.priority.enforcement_mode).toBe("observe");
  });

  it("is idempotent: same inputs produce identical outputs", () => {
    const params = {
      health: { energy_index: 50, sleep_debt_score: 40, recovery_index: 55, volatility_flag: false, confidence_score: 60 } as HealthState,
      financial: { monthly_spending: 2000, impulse_spend_count: 5, savings_ratio: 20, financial_stress_index: 40, confidence_score: 60 } as FinancialState,
      cognitive: { avg_confidence: 6, regret_index: 30, bias_frequency_score: 20, decision_volatility: 30, confidence_score: 60 } as CognitiveState,
      behavioural: null,
      governance: { state_json: { governance_risk_score: 3, recovery_state: "ok" } } as GovernanceState,
      selectedDomains: ["physical-health"] as FocusDomain[],
    };

    const a = runPipeline(params);
    const b = runPipeline(params);

    expect(a.masterState).toStrictEqual(b.masterState);
    expect(a.systemPhase).toBe(b.systemPhase);
    expect(a.priority).toStrictEqual(b.priority);
  });
});

// ─── Enforcement invariant: system_status freshness ─────────────────────────

describe("enforcement invariant: system_status freshness", () => {
  it("returns LOW_SYSTEM_SYNC when system_status is null", () => {
    expect(isSystemStatusOutdated(null)).toBe(true);

    const result = getUserExecutionGate({
      governanceState: null,
      masterState: null,
      tokensRemaining: 5000,
      entitlements: defaultEntitlements,
      systemStatus: null,
    });

    expect(result.reasonCodes).toContain(REASON_CODES.LOW_SYSTEM_SYNC);
  });

  it("returns LOW_SYSTEM_SYNC when system_status is old", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const oldStatus: SystemStatusSnapshot = {
      global_stability_score: 70,
      system_phase: "stable",
      top_priority_domain: "none",
      urgency_level: 20,
      enforcement_mode: "observe",
      confidence_score: 80,
      sample_size: 5,
      updated_at: twoHoursAgo.toISOString(),
    };

    expect(isSystemStatusOutdated(oldStatus, now)).toBe(true);
  });

  it("does NOT return LOW_SYSTEM_SYNC when system_status is fresh", () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const freshStatus: SystemStatusSnapshot = {
      global_stability_score: 70,
      system_phase: "stable",
      top_priority_domain: "none",
      urgency_level: 20,
      enforcement_mode: "observe",
      confidence_score: 80,
      sample_size: 5,
      updated_at: fiveMinutesAgo.toISOString(),
    };

    expect(isSystemStatusOutdated(freshStatus, now)).toBe(false);

    const result = getUserExecutionGate({
      governanceState: null,
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
      tokensRemaining: 5000,
      entitlements: defaultEntitlements,
      systemStatus: freshStatus,
    });

    expect(result.reasonCodes).not.toContain(REASON_CODES.LOW_SYSTEM_SYNC);
  });

  it("gate refuses enforcement if system_status outdated", () => {
    const now = new Date();
    const oldTime = new Date(now.getTime() - 60 * 60 * 1000);

    const result = getUserExecutionGate({
      governanceState: null,
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
      tokensRemaining: 5000,
      entitlements: defaultEntitlements,
      systemStatus: {
        global_stability_score: 70,
        system_phase: "stable",
        top_priority_domain: "none",
        urgency_level: 20,
        enforcement_mode: "observe",
        confidence_score: 80,
        sample_size: 5,
        updated_at: oldTime.toISOString(),
      },
    });

    expect(result.reasonCodes).toContain(REASON_CODES.LOW_SYSTEM_SYNC);
  });
});
