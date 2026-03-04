/**
 * System Phase Engine (deterministic only).
 * Derives the system-wide operating phase from aggregated state.
 * No AI. No narrative. Pure rules.
 */

import type { RiskDomain, GovernanceState } from "@/lib/system/masterStateEngine";

export type SystemPhase = "stable" | "growth" | "volatile" | "recovery" | "overloaded";

export interface PhaseInput {
  overload_flag: boolean;
  global_stability_score: number;
  dominant_risk_domain: RiskDomain;
  governance_risk_score: number;
  recovery_state: string | null;
  volatility_flags: {
    health_volatility: boolean;
    cognitive_volatility: boolean;
  };
  confidence_score: number;
}

const RECOVERY_RISK_THRESHOLD = 65;
const GROWTH_STABILITY_THRESHOLD = 75;
const GROWTH_STRESS_CEILING = 30;

/**
 * Deterministic phase derivation.
 * Precedence (highest to lowest):
 *   1. overloaded — overload_flag true
 *   2. recovery   — relapse state OR governance risk score high
 *   3. volatile   — domain volatility present without relapse
 *   4. growth     — high stability + low overall stress
 *   5. stable     — default
 */
export function computeSystemPhase(input: PhaseInput): SystemPhase {
  if (input.overload_flag) return "overloaded";

  if (
    input.recovery_state === "relapse" ||
    input.governance_risk_score >= RECOVERY_RISK_THRESHOLD
  ) {
    return "recovery";
  }

  const hasVolatility =
    input.volatility_flags.health_volatility ||
    input.volatility_flags.cognitive_volatility;

  if (hasVolatility && input.global_stability_score < GROWTH_STABILITY_THRESHOLD) {
    return "volatile";
  }

  const effectiveStress = 100 - input.global_stability_score;
  if (
    input.global_stability_score >= GROWTH_STABILITY_THRESHOLD &&
    effectiveStress <= GROWTH_STRESS_CEILING
  ) {
    return "growth";
  }

  return "stable";
}

/**
 * Extract phase inputs from raw domain/governance state.
 * Bridges the gap between DB-layer types and phase engine inputs.
 */
export function extractPhaseInputs(params: {
  overload_flag: boolean;
  global_stability_score: number;
  dominant_risk_domain: RiskDomain;
  governance: GovernanceState | null;
  health_volatility_flag: boolean;
  cognitive_volatility_flag: boolean;
  confidence_score: number;
}): PhaseInput {
  return {
    overload_flag: params.overload_flag,
    global_stability_score: params.global_stability_score,
    dominant_risk_domain: params.dominant_risk_domain,
    governance_risk_score: params.governance?.state_json?.governance_risk_score ?? 0,
    recovery_state: params.governance?.state_json?.recovery_state ?? null,
    volatility_flags: {
      health_volatility: params.health_volatility_flag,
      cognitive_volatility: params.cognitive_volatility_flag,
    },
    confidence_score: params.confidence_score,
  };
}
