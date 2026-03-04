/**
 * Priority Arbitration Engine (deterministic only).
 * Computes the single top-priority domain, urgency level,
 * intervention type, and enforcement mode from system state.
 * No AI. No narrative. Pure rules.
 */

import type { RiskDomain, GovernanceState, MasterStateOutput } from "@/lib/system/masterStateEngine";
import type { SystemPhase } from "@/lib/system/phaseEngine";
import type { PlanEntitlement } from "@/lib/plans/types";
import type { FocusDomain } from "@/lib/focusAreas";
import { isDomainSelected } from "@/lib/system/focusWeights";

export type InterventionType =
  | "none"
  | "checkin_prompt"
  | "focus_redirect"
  | "recovery_support"
  | "overload_pause";

export type EnforcementMode = "observe" | "soft" | "strict";

export interface PriorityInput {
  masterState: MasterStateOutput;
  governanceState: GovernanceState | null;
  selectedDomains: FocusDomain[];
  entitlements: PlanEntitlement;
  systemPhase: SystemPhase;
  domainStress: Record<RiskDomain, number>;
}

export interface PriorityOutput {
  top_priority_domain: RiskDomain;
  urgency_level: number;
  intervention_type: InterventionType;
  enforcement_mode: EnforcementMode;
}

const CONFIDENCE_TRUST_THRESHOLD = 30;
const HIGH_URGENCY_THRESHOLD = 70;
const STRESS_ESCALATION_THRESHOLD = 60;

/**
 * Deterministic priority arbitration.
 *
 * Ranking rules:
 *   1. Never escalate when confidence is below trust threshold.
 *   2. Relapse overrides all other priorities → recovery_support, strict.
 *   3. Overloaded phase → overload_pause on dominant domain, soft.
 *   4. Volatile phase → recovery priority increased for dominant domain.
 *   5. Selected domains receive priority preference in ties.
 *   6. Urgency scales with stress level of top domain.
 */
export function computePriority(input: PriorityInput): PriorityOutput {
  const {
    masterState,
    governanceState,
    selectedDomains,
    systemPhase,
    domainStress,
  } = input;

  const isLowConfidence = masterState.confidence_score < CONFIDENCE_TRUST_THRESHOLD;
  const recoveryState = governanceState?.state_json?.recovery_state ?? null;
  const isRelapse = recoveryState === "relapse";

  if (isLowConfidence) {
    return {
      top_priority_domain: masterState.dominant_risk_domain,
      urgency_level: 0,
      intervention_type: "none",
      enforcement_mode: "observe",
    };
  }

  if (isRelapse) {
    const relapseDomain = resolveRelapseDomain(masterState, domainStress, selectedDomains);
    const urgency = Math.min(100, Math.max(0, domainStress[relapseDomain] + 20));
    return {
      top_priority_domain: relapseDomain,
      urgency_level: urgency,
      intervention_type: "recovery_support",
      enforcement_mode: "strict",
    };
  }

  if (systemPhase === "overloaded") {
    return {
      top_priority_domain: masterState.dominant_risk_domain,
      urgency_level: Math.min(100, Math.round(100 - masterState.global_stability_score)),
      intervention_type: "overload_pause",
      enforcement_mode: "soft",
    };
  }

  const topDomain = resolveTopDomain(masterState, domainStress, selectedDomains);
  const stress = domainStress[topDomain] ?? 0;
  const urgency = computeUrgency(stress, systemPhase);
  const intervention = resolveIntervention(stress, systemPhase);
  const enforcement = resolveEnforcement(urgency, systemPhase);

  return {
    top_priority_domain: topDomain,
    urgency_level: urgency,
    intervention_type: intervention,
    enforcement_mode: enforcement,
  };
}

function resolveRelapseDomain(
  masterState: MasterStateOutput,
  domainStress: Record<RiskDomain, number>,
  selectedDomains: FocusDomain[],
): RiskDomain {
  if (isDomainSelected("governance", selectedDomains)) return "governance";
  if (masterState.dominant_risk_domain !== "none") return masterState.dominant_risk_domain;
  return findHighestStressDomain(domainStress);
}

function resolveTopDomain(
  masterState: MasterStateOutput,
  domainStress: Record<RiskDomain, number>,
  selectedDomains: FocusDomain[],
): RiskDomain {
  const candidate = masterState.dominant_risk_domain;
  if (candidate !== "none") return candidate;
  return findHighestSelectedDomain(domainStress, selectedDomains);
}

function findHighestStressDomain(stressMap: Record<RiskDomain, number>): RiskDomain {
  const keys: RiskDomain[] = ["health", "financial", "cognitive", "behavioural", "governance"];
  let max = 0;
  let result: RiskDomain = "none";
  for (const k of keys) {
    if (stressMap[k] > max) {
      max = stressMap[k];
      result = k;
    }
  }
  return result;
}

function findHighestSelectedDomain(
  stressMap: Record<RiskDomain, number>,
  selectedDomains: FocusDomain[],
): RiskDomain {
  const FOCUS_TO_RISK: Partial<Record<FocusDomain, RiskDomain>> = {
    "physical-health": "health",
    "financial-discipline": "financial",
    "emotional-intelligence": "cognitive",
    "performance-focus": "cognitive",
    "self-mastery": "behavioural",
    "addiction-recovery": "governance",
  };

  let max = 0;
  let result: RiskDomain = "none";

  for (const fd of selectedDomains) {
    const riskDomain = FOCUS_TO_RISK[fd];
    if (riskDomain && stressMap[riskDomain] > max) {
      max = stressMap[riskDomain];
      result = riskDomain;
    }
  }

  if (result === "none") return findHighestStressDomain(stressMap);
  return result;
}

function computeUrgency(stress: number, phase: SystemPhase): number {
  let urgency = stress;

  if (phase === "volatile") urgency = Math.min(100, urgency + 15);
  if (phase === "recovery") urgency = Math.min(100, urgency + 10);

  return Math.round(Math.min(100, Math.max(0, urgency)));
}

function resolveIntervention(stress: number, phase: SystemPhase): InterventionType {
  if (phase === "recovery") return "recovery_support";
  if (phase === "volatile" && stress >= STRESS_ESCALATION_THRESHOLD) return "focus_redirect";
  if (stress >= HIGH_URGENCY_THRESHOLD) return "checkin_prompt";
  return "none";
}

function resolveEnforcement(urgency: number, phase: SystemPhase): EnforcementMode {
  if (phase === "recovery") return "soft";
  if (urgency >= HIGH_URGENCY_THRESHOLD) return "soft";
  return "observe";
}
