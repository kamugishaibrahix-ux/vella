/**
 * Priority Arbitration Engine — Unit Tests
 */

import { describe, it, expect } from "vitest";
import { computePriority, type PriorityInput, type PriorityOutput } from "@/lib/system/priorityEngine";
import type { MasterStateOutput, GovernanceState, RiskDomain } from "@/lib/system/masterStateEngine";
import type { PlanEntitlement } from "@/lib/plans/types";
import type { SystemPhase } from "@/lib/system/phaseEngine";
import type { FocusDomain } from "@/lib/focusAreas";

const defaultEntitlements: PlanEntitlement = {
  maxMonthlyTokens: 10_000,
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

function makeGovernance(overrides: Partial<GovernanceState["state_json"]> = {}): GovernanceState {
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

function makeStress(overrides: Partial<Record<RiskDomain, number>> = {}): Record<RiskDomain, number> {
  return {
    health: 20,
    financial: 20,
    cognitive: 20,
    behavioural: 10,
    governance: 10,
    none: 0,
    ...overrides,
  };
}

function makeInput(overrides: Partial<PriorityInput> = {}): PriorityInput {
  return {
    masterState: makeMasterState(),
    governanceState: makeGovernance(),
    selectedDomains: ["physical-health", "financial-discipline"] as FocusDomain[],
    entitlements: defaultEntitlements,
    systemPhase: "stable" as SystemPhase,
    domainStress: makeStress(),
    ...overrides,
  };
}

describe("computePriority", () => {
  // ─── Low confidence: observe mode, no escalation ──────────────────────
  it("never escalates when confidence is low", () => {
    const result = computePriority(makeInput({
      masterState: makeMasterState({ confidence_score: 10, dominant_risk_domain: "health" }),
      domainStress: makeStress({ health: 90 }),
    }));

    expect(result.urgency_level).toBe(0);
    expect(result.intervention_type).toBe("none");
    expect(result.enforcement_mode).toBe("observe");
  });

  // ─── Relapse overrides performance priority ───────────────────────────
  it("relapse overrides all priorities → recovery_support, strict", () => {
    const result = computePriority(makeInput({
      governanceState: makeGovernance({ recovery_state: "relapse" }),
      masterState: makeMasterState({ confidence_score: 80, dominant_risk_domain: "financial" }),
      domainStress: makeStress({ financial: 70, governance: 30 }),
      selectedDomains: ["addiction-recovery"] as FocusDomain[],
    }));

    expect(result.intervention_type).toBe("recovery_support");
    expect(result.enforcement_mode).toBe("strict");
    expect(result.top_priority_domain).toBe("governance");
  });

  it("relapse uses dominant risk domain when governance not selected", () => {
    const result = computePriority(makeInput({
      governanceState: makeGovernance({ recovery_state: "relapse" }),
      masterState: makeMasterState({ dominant_risk_domain: "health", confidence_score: 80 }),
      domainStress: makeStress({ health: 80 }),
      selectedDomains: ["physical-health"] as FocusDomain[],
    }));

    expect(result.top_priority_domain).toBe("health");
    expect(result.enforcement_mode).toBe("strict");
  });

  it("relapse urgency is domain stress + 20, capped at 100", () => {
    const result = computePriority(makeInput({
      governanceState: makeGovernance({ recovery_state: "relapse" }),
      masterState: makeMasterState({ dominant_risk_domain: "health", confidence_score: 80 }),
      domainStress: makeStress({ health: 90 }),
      selectedDomains: ["physical-health"] as FocusDomain[],
    }));

    expect(result.urgency_level).toBe(100);
  });

  // ─── Overload suppresses focus domain ─────────────────────────────────
  it("overload returns overload_pause on dominant domain, soft enforcement", () => {
    const result = computePriority(makeInput({
      systemPhase: "overloaded",
      masterState: makeMasterState({
        overload_flag: true,
        dominant_risk_domain: "financial",
        global_stability_score: 30,
        confidence_score: 80,
      }),
      domainStress: makeStress({ financial: 80, health: 70 }),
    }));

    expect(result.top_priority_domain).toBe("financial");
    expect(result.intervention_type).toBe("overload_pause");
    expect(result.enforcement_mode).toBe("soft");
    expect(result.urgency_level).toBe(70);
  });

  // ─── High financial stress shifts dominant risk ───────────────────────
  it("high financial stress produces highest urgency for financial domain", () => {
    const result = computePriority(makeInput({
      masterState: makeMasterState({ dominant_risk_domain: "financial", confidence_score: 80 }),
      domainStress: makeStress({ financial: 85, health: 30 }),
    }));

    expect(result.top_priority_domain).toBe("financial");
    expect(result.urgency_level).toBe(85);
  });

  // ─── Growth phase → low urgency ──────────────────────────────────────
  it("growth phase with low stress yields observe mode", () => {
    const result = computePriority(makeInput({
      systemPhase: "growth",
      masterState: makeMasterState({ dominant_risk_domain: "none", confidence_score: 80 }),
      domainStress: makeStress(),
    }));

    expect(result.enforcement_mode).toBe("observe");
  });

  // ─── Stale domain does not influence priority ─────────────────────────
  it("stale domain (low confidence) → observe, no escalation", () => {
    const result = computePriority(makeInput({
      masterState: makeMasterState({ confidence_score: 15, dominant_risk_domain: "health" }),
      domainStress: makeStress({ health: 95 }),
    }));

    expect(result.urgency_level).toBe(0);
    expect(result.intervention_type).toBe("none");
    expect(result.enforcement_mode).toBe("observe");
  });

  // ─── Volatile phase boosts urgency ────────────────────────────────────
  it("volatile phase adds +15 urgency to domain stress", () => {
    const result = computePriority(makeInput({
      systemPhase: "volatile",
      masterState: makeMasterState({ dominant_risk_domain: "cognitive", confidence_score: 80 }),
      domainStress: makeStress({ cognitive: 65 }),
    }));

    expect(result.urgency_level).toBe(80);
    expect(result.intervention_type).toBe("focus_redirect");
  });

  // ─── Recovery phase boosts urgency ────────────────────────────────────
  it("recovery phase adds +10 urgency and sets recovery_support", () => {
    const result = computePriority(makeInput({
      systemPhase: "recovery",
      masterState: makeMasterState({ dominant_risk_domain: "behavioural", confidence_score: 80 }),
      domainStress: makeStress({ behavioural: 50 }),
    }));

    expect(result.urgency_level).toBe(60);
    expect(result.intervention_type).toBe("recovery_support");
    expect(result.enforcement_mode).toBe("soft");
  });

  // ─── Selected domains preference ──────────────────────────────────────
  it("prefers selected domains when dominant is none", () => {
    const result = computePriority(makeInput({
      masterState: makeMasterState({ dominant_risk_domain: "none", confidence_score: 80 }),
      selectedDomains: ["physical-health"] as FocusDomain[],
      domainStress: makeStress({ health: 40, financial: 35 }),
    }));

    expect(result.top_priority_domain).toBe("health");
  });

  // ─── High urgency triggers soft enforcement ───────────────────────────
  it("high urgency (≥70) triggers soft enforcement in stable phase", () => {
    const result = computePriority(makeInput({
      systemPhase: "stable",
      masterState: makeMasterState({ dominant_risk_domain: "health", confidence_score: 80 }),
      domainStress: makeStress({ health: 75 }),
    }));

    expect(result.urgency_level).toBe(75);
    expect(result.enforcement_mode).toBe("soft");
    expect(result.intervention_type).toBe("checkin_prompt");
  });
});
