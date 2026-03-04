/**
 * Canonical Enforcement Gate.
 * Single source of truth for all execution-time permission decisions.
 * Deterministic. Fail-closed. No AI. No narrative.
 *
 * UNIFIED STATE AUTHORITY INVARIANT:
 *   All enforcement reads ONLY from:
 *     - governance_state (recovery, escalation)
 *     - system_status_current (phase, urgency, confidence)
 *     - resource_budget_current (budgets)
 *     - entitlements (plan gates)
 *   It must NOT compute domain logic internally.
 *   If recomputeProtocol has not run recently, return LOW_SYSTEM_SYNC.
 *
 * Combines:
 * - Token availability (account status)
 * - System status (from recompute protocol)
 * - Resource budgets (from recompute protocol)
 * - Governance state (recovery_state, escalation)
 * - Confidence scoring (refuse to hard-block on low confidence)
 * - Entitlements (plan-gated features)
 */

import type { PlanEntitlement } from "@/lib/plans/types";
import type { MasterStateOutput, GovernanceState } from "@/lib/system/masterStateEngine";
import type { ResourceBudget } from "@/lib/system/resourceBudgetEngine";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SystemStatusSnapshot {
  global_stability_score: number;
  system_phase: string;
  top_priority_domain: string;
  urgency_level: number;
  enforcement_mode: string;
  confidence_score: number;
  sample_size: number;
  updated_at: string;
}

export interface BudgetCheckRequest {
  requested_focus_minutes?: number;
  decision_complexity?: number;
  spending_amount?: number;
  recovery_hours_available?: number;
}

export interface EnforcementInput {
  governanceState: GovernanceState | null;
  masterState: MasterStateOutput | null;
  tokensRemaining: number;
  entitlements: PlanEntitlement;
  systemStatus?: SystemStatusSnapshot | null;
  budget?: ResourceBudget | null;
  budgetCheck?: BudgetCheckRequest | null;
}

export interface EnforcementResult {
  canSend: boolean;
  canStartFocus: boolean;
  canAccessPremium: boolean;
  reasonCodes: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CONFIDENCE_ENFORCEMENT_THRESHOLD = 30;
const SYSTEM_SYNC_STALE_MINUTES = 30;

export const REASON_CODES = {
  TOKENS_DEPLETED: "tokens_depleted",
  OVERLOAD_ACTIVE: "overload_active",
  LOW_CONFIDENCE_DATA: "low_confidence_data",
  RELAPSE_STATE: "relapse_state",
  STALE_DATA: "stale_data",
  NOT_PAID: "not_paid",
  PREMIUM_FEATURE_GATED: "premium_feature_gated",
  LOW_SYSTEM_SYNC: "low_system_sync",
  FOCUS_BUDGET_EXCEEDED: "focus_budget_exceeded",
  DECISION_COMPLEXITY_EXCEEDED: "decision_complexity_exceeded",
  SPENDING_BUDGET_EXCEEDED: "spending_budget_exceeded",
  RECOVERY_NOT_SATISFIED: "recovery_not_satisfied",
  BUDGET_CRITICAL: "budget_critical",
  DECISION_BUDGET_LOW: "decision_budget_low",
  SPENDING_BAND_TIGHT: "spending_band_tight",
} as const;

// ─── Enforcement Gate ────────────────────────────────────────────────────────

/**
 * Deterministic enforcement gate. Returns what the user can do right now.
 *
 * Rules (in priority order):
 * 0. System sync check → flag if recompute has not run recently
 * 1. Tokens depleted → block canSend
 * 2. Overload flag → soft-block (reduce features, require check-in)
 * 3. Low confidence → do NOT hard-block, instead flag for more data
 * 4. Recovery state = relapse → block specific high-risk actions
 * 5. Entitlements → gate premium features
 * 6. Budget enforcement → check resource budget limits (respects confidence invariant)
 */
export function getUserExecutionGate(input: EnforcementInput): EnforcementResult {
  const { governanceState, masterState, tokensRemaining, entitlements, systemStatus, budget, budgetCheck } = input;

  const reasonCodes: string[] = [];

  let canSend = true;
  let canStartFocus = true;
  let canAccessPremium = entitlements.isPaid;

  // ─── Rule 0: System sync freshness ────────────────────────────────────
  if (isSystemStatusOutdated(systemStatus)) {
    reasonCodes.push(REASON_CODES.LOW_SYSTEM_SYNC);
  }

  // ─── Rule 1: Token depletion → hard block on send ─────────────────────
  if (tokensRemaining <= 0) {
    canSend = false;
    reasonCodes.push(REASON_CODES.TOKENS_DEPLETED);
  }

  // ─── Rule 2: Overload → soft block ────────────────────────────────────
  if (masterState?.overload_flag) {
    canStartFocus = false;
    reasonCodes.push(REASON_CODES.OVERLOAD_ACTIVE);
  }

  // ─── Rule 3: Low confidence → NO hard blocks, flag only ──────────────
  const confidence = masterState?.confidence_score ?? 0;
  const isLowConfidence = confidence < CONFIDENCE_ENFORCEMENT_THRESHOLD;
  if (isLowConfidence) {
    reasonCodes.push(REASON_CODES.LOW_CONFIDENCE_DATA);
  }

  // ─── Rule 4: Stale data → flag only ───────────────────────────────────
  if (masterState?.is_stale) {
    reasonCodes.push(REASON_CODES.STALE_DATA);
  }

  // ─── Rule 5: Relapse state → block high-risk actions ──────────────────
  const recoveryState = governanceState?.state_json?.recovery_state;
  if (recoveryState === "relapse" && !isLowConfidence) {
    canStartFocus = false;
    reasonCodes.push(REASON_CODES.RELAPSE_STATE);
  }

  // ─── Rule 6: Entitlement gate ─────────────────────────────────────────
  if (!entitlements.isPaid) {
    canAccessPremium = false;
    reasonCodes.push(REASON_CODES.NOT_PAID);
  }

  // ─── Rule 7: Budget enforcement (respects confidence invariant) ───────
  const budgetReasons = checkBudgetLimits(budget, budgetCheck, isLowConfidence);
  if (budgetReasons.length > 0) {
    reasonCodes.push(...budgetReasons);
    if (budgetReasons.includes(REASON_CODES.FOCUS_BUDGET_EXCEEDED)) {
      canStartFocus = false;
    }
  }

  // ─── Rule 8: Constraint-level-aware budget rules ──────────────────────
  const constraintReasons = checkConstraintLevelRules(budget, budgetCheck);
  if (constraintReasons.length > 0) {
    reasonCodes.push(...constraintReasons);
    if (constraintReasons.includes(REASON_CODES.BUDGET_CRITICAL)) {
      canStartFocus = false;
    }
    if (constraintReasons.includes(REASON_CODES.DECISION_BUDGET_LOW)) {
      canStartFocus = false;
    }
  }

  return {
    canSend,
    canStartFocus,
    canAccessPremium,
    reasonCodes,
  };
}

/**
 * Check requested activity against resource budgets.
 * Returns empty array if no budget or no check requested.
 * When budget_confidence is below threshold, only flags — never blocks.
 */
export function checkBudgetLimits(
  budget?: ResourceBudget | null,
  check?: BudgetCheckRequest | null,
  isLowConfidence?: boolean,
): string[] {
  if (!budget || !check) return [];

  const isBudgetLowConfidence = isLowConfidence || budget.budget_confidence < CONFIDENCE_ENFORCEMENT_THRESHOLD;
  const reasons: string[] = [];

  if (
    check.requested_focus_minutes !== undefined &&
    check.requested_focus_minutes > budget.max_focus_minutes_today
  ) {
    reasons.push(REASON_CODES.FOCUS_BUDGET_EXCEEDED);
  }

  if (
    check.decision_complexity !== undefined &&
    check.decision_complexity > budget.max_decision_complexity
  ) {
    reasons.push(REASON_CODES.DECISION_COMPLEXITY_EXCEEDED);
  }

  if (
    check.spending_amount !== undefined &&
    check.spending_amount > budget.spending_tolerance_band
  ) {
    reasons.push(REASON_CODES.SPENDING_BUDGET_EXCEEDED);
  }

  if (
    check.recovery_hours_available !== undefined &&
    budget.recovery_required_hours > 0 &&
    check.recovery_hours_available < budget.recovery_required_hours
  ) {
    reasons.push(REASON_CODES.RECOVERY_NOT_SATISFIED);
  }

  if (isBudgetLowConfidence) {
    return reasons.length > 0 ? reasons : [];
  }

  return reasons;
}

/**
 * Constraint-level-aware rules.
 * These supplement the basic budget checks with severity-aware logic:
 * - BUDGET_CRITICAL: critical constraint + deep focus requested (>30 min)
 * - DECISION_BUDGET_LOW: max_decision_complexity < 3 and high-complexity action requested
 * - SPENDING_BAND_TIGHT: spending_tolerance_band <= 10 and spending action requested
 */
export function checkConstraintLevelRules(
  budget?: ResourceBudget | null,
  check?: BudgetCheckRequest | null,
): string[] {
  if (!budget) return [];

  const reasons: string[] = [];

  if (
    budget.constraint_level === "critical" &&
    check?.requested_focus_minutes !== undefined &&
    check.requested_focus_minutes > 30
  ) {
    reasons.push(REASON_CODES.BUDGET_CRITICAL);
  }

  if (
    budget.max_decision_complexity < 3 &&
    check?.decision_complexity !== undefined &&
    check.decision_complexity > budget.max_decision_complexity
  ) {
    reasons.push(REASON_CODES.DECISION_BUDGET_LOW);
  }

  if (
    budget.spending_tolerance_band <= 10 &&
    check?.spending_amount !== undefined
  ) {
    reasons.push(REASON_CODES.SPENDING_BAND_TIGHT);
  }

  return reasons;
}

/**
 * Quick check: should enforcement decisions be trusted?
 * Returns false if data is too stale or confidence too low to make
 * reliable enforcement decisions. In that case, callers should
 * default to permissive behavior and request more data.
 */
export function isEnforcementReliable(masterState: MasterStateOutput | null): boolean {
  if (!masterState) return false;
  return masterState.confidence_score >= CONFIDENCE_ENFORCEMENT_THRESHOLD && !masterState.is_stale;
}

/**
 * Returns true if system_status_current is missing or was last updated
 * more than SYSTEM_SYNC_STALE_MINUTES ago.
 */
export function isSystemStatusOutdated(
  systemStatus?: SystemStatusSnapshot | null,
  now?: Date,
): boolean {
  if (!systemStatus) return true;
  if (!systemStatus.updated_at) return true;

  const updatedAt = new Date(systemStatus.updated_at).getTime();
  const current = (now ?? new Date()).getTime();
  const elapsedMinutes = (current - updatedAt) / (1000 * 60);

  return elapsedMinutes > SYSTEM_SYNC_STALE_MINUTES;
}
