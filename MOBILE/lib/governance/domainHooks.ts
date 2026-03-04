/**
 * Domain → Governance Hooks
 * Records domain engine signals as governance events via scheduler_tick.
 * Uses structured metadata codes only. No free text.
 * Does NOT override governance computation; only appends signal events.
 */

"use server";

import { recordEvent } from "@/lib/governance/events";
import type { HealthStateOutput } from "@/lib/health/healthEngine";
import { evaluateHealthGovernanceSignal } from "@/lib/health/healthEngine";
import type { FinancialStateOutput } from "@/lib/finance/financeEngine";
import { evaluateFinancialGovernanceSignal } from "@/lib/finance/financeEngine";
import type { CognitiveStateOutput } from "@/lib/cognitive/cognitiveEngine";
import { evaluateCognitiveGovernanceSignal } from "@/lib/cognitive/cognitiveEngine";

export type DomainHookResult =
  | { success: true; signalRecorded: boolean }
  | { success: false; error: string };

/**
 * Evaluate health state and record governance signal if thresholds breached.
 * Records a scheduler_tick event with domain_signal metadata.
 */
export async function recordHealthGovernanceSignal(
  userId: string,
  state: HealthStateOutput,
): Promise<DomainHookResult> {
  const signal = evaluateHealthGovernanceSignal(state);
  if (!signal) return { success: true, signalRecorded: false };

  const result = await recordEvent(userId, "scheduler_tick", undefined, undefined, {
    domain_signal: "health_risk",
    risk_increment: signal.risk_increment,
    focus_intensity_reduction: signal.focus_intensity_reduction ? 1 : 0,
    sleep_debt_flag: state.sleep_debt_score > 70 ? 1 : 0,
    low_recovery_flag: state.recovery_index < 30 ? 1 : 0,
  });

  if (!result.success) return { success: false, error: result.error };
  return { success: true, signalRecorded: true };
}

/**
 * Evaluate financial state and record governance signal if stress threshold breached.
 * Records a scheduler_tick event with domain_signal metadata.
 */
export async function recordFinancialGovernanceSignal(
  userId: string,
  state: FinancialStateOutput,
): Promise<DomainHookResult> {
  const signal = evaluateFinancialGovernanceSignal(state);
  if (!signal) return { success: true, signalRecorded: false };

  const result = await recordEvent(userId, "scheduler_tick", undefined, undefined, {
    domain_signal: "financial_instability",
    risk_increment: signal.risk_increment,
    stress_index: state.financial_stress_index,
  });

  if (!result.success) return { success: false, error: result.error };
  return { success: true, signalRecorded: true };
}

/**
 * Evaluate cognitive state and record governance signal if thresholds breached.
 * Records a scheduler_tick event with domain_signal metadata.
 */
export async function recordCognitiveGovernanceSignal(
  userId: string,
  state: CognitiveStateOutput,
): Promise<DomainHookResult> {
  const signal = evaluateCognitiveGovernanceSignal(state);
  if (!signal) return { success: true, signalRecorded: false };

  const result = await recordEvent(userId, "scheduler_tick", undefined, undefined, {
    domain_signal: "cognitive_instability",
    risk_increment: signal.risk_increment,
    checkin_frequency_flag: signal.checkin_frequency_flag ? 1 : 0,
    regret_flag: state.regret_index > 60 ? 1 : 0,
    volatility_flag: state.decision_volatility > 60 ? 1 : 0,
  });

  if (!result.success) return { success: false, error: result.error };
  return { success: true, signalRecorded: true };
}
