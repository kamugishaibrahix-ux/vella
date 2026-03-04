/**
 * Resource Budget Engine (deterministic only).
 * Computes daily resource budgets derived from aggregated system state.
 * Converts Vella from state monitor to resource allocator.
 *
 * Budgets:
 *   - max_focus_minutes_today: daily focus capacity
 *   - max_decision_complexity: cognitive load ceiling (1–10)
 *   - spending_tolerance_band: acceptable daily spending range
 *   - recovery_required_hours: mandatory recovery time
 *   - budget_confidence: trust level in these budgets (0–100)
 *
 * No AI. No randomness. Pure deterministic derivation.
 */

import type { MasterStateOutput, GovernanceState, HealthState, FinancialState, CognitiveState } from "@/lib/system/masterStateEngine";
import type { SystemPhase } from "@/lib/system/phaseEngine";
import type { FocusDomain } from "@/lib/focusAreas";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BudgetInput {
  masterState: MasterStateOutput | null;
  governanceState: GovernanceState | null;
  systemPhase: SystemPhase;
  healthState: HealthState | null;
  financialState: FinancialState | null;
  cognitiveState: CognitiveState | null;
  selectedDomains: FocusDomain[];
}

export type ConstraintLevel = "normal" | "constrained" | "critical";

export interface ResourceBudget {
  max_focus_minutes_today: number;
  max_decision_complexity: number;
  spending_tolerance_band: number;
  recovery_required_hours: number;
  budget_confidence: number;
  constraint_level: ConstraintLevel;
  confidence_score: number;
  sample_size: number;
  data_freshness_hours: number;
  is_stale: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const BUDGET_CONSTANTS = {
  BASE_FOCUS_MINUTES: 180,
  SLEEP_DEBT_FOCUS_FACTOR: 0.8,
  OVERLOAD_FOCUS_MULTIPLIER: 0.5,
  VOLATILITY_FOCUS_MULTIPLIER: 0.75,
  RECOVERY_FOCUS_MULTIPLIER: 0.6,
  MIN_FOCUS_MINUTES: 15,

  BASE_DECISION_COMPLEXITY: 10,
  REGRET_COMPLEXITY_FACTOR: 0.04,
  VOLATILITY_COMPLEXITY_FACTOR: 0.03,
  LOW_CONFIDENCE_COMPLEXITY_PENALTY: 2,
  MIN_DECISION_COMPLEXITY: 1,

  BASE_SPENDING_TOLERANCE: 100,
  STRESS_SPENDING_FACTOR: 0.6,
  GROWTH_SPENDING_BONUS: 1.15,
  MIN_SPENDING_TOLERANCE: 10,

  BASE_RECOVERY_HOURS: 0,
  SLEEP_DEBT_RECOVERY_FACTOR: 0.08,
  RELAPSE_RECOVERY_BONUS: 3,
  OVERLOAD_RECOVERY_BONUS: 2,
  MAX_RECOVERY_HOURS: 12,

  CONFIDENCE_TRUST_THRESHOLD: 30,
} as const;

// ─── Pure Computation Functions (exported for testing) ───────────────────────

/**
 * Daily Focus Budget (minutes).
 * Starts at 180 min, reduced by sleep debt, overload, volatility, recovery phase.
 */
export function computeFocusBudget(
  sleepDebtScore: number,
  overloadFlag: boolean,
  healthVolatility: boolean,
  systemPhase: SystemPhase,
): number {
  let budget = BUDGET_CONSTANTS.BASE_FOCUS_MINUTES;

  const sleepDebtReduction = sleepDebtScore * BUDGET_CONSTANTS.SLEEP_DEBT_FOCUS_FACTOR;
  budget -= sleepDebtReduction;

  if (overloadFlag) {
    budget *= BUDGET_CONSTANTS.OVERLOAD_FOCUS_MULTIPLIER;
  }

  if (healthVolatility) {
    budget *= BUDGET_CONSTANTS.VOLATILITY_FOCUS_MULTIPLIER;
  }

  if (systemPhase === "recovery") {
    budget *= BUDGET_CONSTANTS.RECOVERY_FOCUS_MULTIPLIER;
  }

  return Math.round(Math.max(BUDGET_CONSTANTS.MIN_FOCUS_MINUTES, Math.min(BUDGET_CONSTANTS.BASE_FOCUS_MINUTES, budget)));
}

/**
 * Decision Complexity Budget (1–10).
 * Reduced by high regret, emotional volatility, low confidence.
 */
export function computeDecisionComplexityBudget(
  regretIndex: number,
  decisionVolatility: number,
  confidenceScore: number,
): number {
  let budget = BUDGET_CONSTANTS.BASE_DECISION_COMPLEXITY;

  budget -= regretIndex * BUDGET_CONSTANTS.REGRET_COMPLEXITY_FACTOR;
  budget -= decisionVolatility * BUDGET_CONSTANTS.VOLATILITY_COMPLEXITY_FACTOR;

  if (confidenceScore < BUDGET_CONSTANTS.CONFIDENCE_TRUST_THRESHOLD) {
    budget -= BUDGET_CONSTANTS.LOW_CONFIDENCE_COMPLEXITY_PENALTY;
  }

  return Math.round(Math.max(BUDGET_CONSTANTS.MIN_DECISION_COMPLEXITY, Math.min(10, budget)));
}

/**
 * Spending Tolerance Band.
 * Based on savings_ratio, shrunk by financial stress, expanded in growth phase.
 */
export function computeSpendingTolerance(
  savingsRatio: number,
  financialStressIndex: number,
  systemPhase: SystemPhase,
): number {
  let tolerance = BUDGET_CONSTANTS.BASE_SPENDING_TOLERANCE + savingsRatio;

  const stressReduction = financialStressIndex * BUDGET_CONSTANTS.STRESS_SPENDING_FACTOR;
  tolerance -= stressReduction;

  if (systemPhase === "growth") {
    tolerance *= BUDGET_CONSTANTS.GROWTH_SPENDING_BONUS;
  }

  return Math.round(Math.max(BUDGET_CONSTANTS.MIN_SPENDING_TOLERANCE, tolerance) * 100) / 100;
}

/**
 * Recovery Required Hours.
 * Derived from sleep debt, with extras for relapse and overload. Capped at 12.
 */
export function computeRecoveryHours(
  sleepDebtScore: number,
  isRelapse: boolean,
  isOverloaded: boolean,
): number {
  let hours = BUDGET_CONSTANTS.BASE_RECOVERY_HOURS;

  hours += sleepDebtScore * BUDGET_CONSTANTS.SLEEP_DEBT_RECOVERY_FACTOR;

  if (isRelapse) {
    hours += BUDGET_CONSTANTS.RELAPSE_RECOVERY_BONUS;
  }

  if (isOverloaded) {
    hours += BUDGET_CONSTANTS.OVERLOAD_RECOVERY_BONUS;
  }

  return Math.round(Math.min(BUDGET_CONSTANTS.MAX_RECOVERY_HOURS, Math.max(0, hours)));
}

/**
 * Budget Confidence.
 * Minimum confidence across all available domain engines.
 * If no domain data, confidence = 0.
 */
export function computeBudgetConfidence(
  healthConfidence: number | undefined,
  financialConfidence: number | undefined,
  cognitiveConfidence: number | undefined,
): number {
  const scores: number[] = [];
  if (healthConfidence !== undefined) scores.push(healthConfidence);
  if (financialConfidence !== undefined) scores.push(financialConfidence);
  if (cognitiveConfidence !== undefined) scores.push(cognitiveConfidence);

  if (scores.length === 0) return 0;
  return Math.min(...scores);
}

/**
 * Derive constraint level from computed budget values.
 * Critical: severely restricted. Constrained: reduced capacity. Normal: full capacity.
 */
export function deriveConstraintLevel(
  focusMinutes: number,
  decisionComplexity: number,
  spendingBand: number,
): ConstraintLevel {
  if (focusMinutes <= 30 || decisionComplexity <= 2 || spendingBand <= 10) {
    return "critical";
  }
  if (focusMinutes <= 60 || decisionComplexity <= 4 || spendingBand <= 20) {
    return "constrained";
  }
  return "normal";
}

// ─── Main Budget Computation ─────────────────────────────────────────────────

/**
 * Full resource budget derivation.
 * Pure function: no DB reads, no side effects.
 */
export function computeResourceBudget(input: BudgetInput): ResourceBudget {
  const { masterState, governanceState, systemPhase, healthState, financialState, cognitiveState } = input;

  const sleepDebt = healthState?.sleep_debt_score ?? 0;
  const overloadFlag = masterState?.overload_flag ?? false;
  const healthVolatility = healthState?.volatility_flag ?? false;
  const recoveryState = governanceState?.state_json?.recovery_state ?? null;
  const isRelapse = recoveryState === "relapse";

  const regretIndex = cognitiveState?.regret_index ?? 0;
  const decisionVolatility = cognitiveState?.decision_volatility ?? 0;
  const masterConfidence = masterState?.confidence_score ?? 0;

  const savingsRatio = financialState?.savings_ratio ?? 0;
  const financialStress = financialState?.financial_stress_index ?? 0;

  const max_focus_minutes_today = computeFocusBudget(
    sleepDebt,
    overloadFlag,
    healthVolatility,
    systemPhase,
  );

  const max_decision_complexity = computeDecisionComplexityBudget(
    regretIndex,
    decisionVolatility,
    masterConfidence,
  );

  const spending_tolerance_band = computeSpendingTolerance(
    savingsRatio,
    financialStress,
    systemPhase,
  );

  const recovery_required_hours = computeRecoveryHours(
    sleepDebt,
    isRelapse,
    overloadFlag,
  );

  const budget_confidence = computeBudgetConfidence(
    healthState?.confidence_score,
    financialState?.confidence_score,
    cognitiveState?.confidence_score,
  );

  const constraint_level = deriveConstraintLevel(
    max_focus_minutes_today,
    max_decision_complexity,
    spending_tolerance_band,
  );

  return {
    max_focus_minutes_today,
    max_decision_complexity,
    spending_tolerance_band,
    recovery_required_hours,
    budget_confidence,
    constraint_level,
    confidence_score: masterState?.confidence_score ?? 0,
    sample_size: masterState?.sample_size ?? 0,
    data_freshness_hours: masterState?.data_freshness_hours ?? 0,
    is_stale: masterState?.is_stale ?? true,
  };
}
