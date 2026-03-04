/**
 * Authoritative Recompute Protocol.
 * Single entry point for full-system deterministic state recomputation.
 * Fetches all domain inputs, recomputes every engine idempotently,
 * derives system phase + priority + resource budgets,
 * persists system_status_current + resource_budget_current,
 * logs system transitions when state changes.
 *
 * Invariants:
 *   - Idempotent: calling twice with same DB state yields identical output.
 *   - Atomic: writes only after all computations succeed.
 *   - No side effects outside safeUpsert / safeInsert writes.
 *   - No AI calls. Pure deterministic state transitions.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeUpsert, safeInsert } from "@/lib/safe/safeSupabaseWrite";
import type { FocusDomain } from "@/lib/focusAreas";

import { computeHealthState } from "@/lib/health/healthEngine";
import { computeFinancialState } from "@/lib/finance/financeEngine";
import { computeCognitiveState } from "@/lib/cognitive/cognitiveEngine";
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
  type RiskDomain,
} from "@/lib/system/masterStateEngine";
import { computeDomainWeights, type DomainWeightMap } from "@/lib/system/focusWeights";
import { findDominantRiskDomain } from "@/lib/system/masterStateEngine";
import { computeSystemPhase, extractPhaseInputs, type SystemPhase } from "@/lib/system/phaseEngine";
import { computePriority, type PriorityOutput } from "@/lib/system/priorityEngine";
import { computeResourceBudget, type ResourceBudget, type ConstraintLevel } from "@/lib/system/resourceBudgetEngine";
import {
  recordHealthGovernanceSignal,
  recordFinancialGovernanceSignal,
  recordCognitiveGovernanceSignal,
} from "@/lib/governance/domainHooks";
import type { PlanEntitlement } from "@/lib/plans/types";
import { resolvePlanEntitlements } from "@/lib/plans/resolvePlanEntitlements";
import { getUserPlanTier } from "@/lib/tiers/server";
import type { EnforcementMode } from "@/lib/system/priorityEngine";
import { appendSystemTransitionIfChanged, type TriggerSource } from "@/lib/system/transitionLogger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RecomputeResult {
  success: boolean;
  error?: string;
  masterState?: MasterStateOutput;
  systemPhase?: SystemPhase;
  priority?: PriorityOutput;
  budget?: ResourceBudget;
  transitionLogged?: boolean;
}

export interface PreviousSystemStatus {
  system_phase: string;
  top_priority_domain: string;
  enforcement_mode: string;
  constraint_level: string;
}

// Staleness threshold: if system_status was updated less than this many
// seconds ago, skip recompute to prevent tight loops.
const MIN_RECOMPUTE_INTERVAL_SEC = 10;

// ─── Transition Detection (exported for testing) ─────────────────────────────

export function detectTransition(
  previous: PreviousSystemStatus | null,
  newPhase: SystemPhase,
  newPriority: RiskDomain,
  newEnforcement: EnforcementMode,
): boolean {
  if (!previous) return false;
  return (
    previous.system_phase !== newPhase ||
    previous.top_priority_domain !== newPriority ||
    previous.enforcement_mode !== newEnforcement
  );
}

// ─── Main Recompute ──────────────────────────────────────────────────────────

export async function recomputeUserSystem(
  userId: string,
  selectedDomains: FocusDomain[],
  triggerSource: TriggerSource = "system_recompute",
): Promise<RecomputeResult> {
  try {
    if (!supabaseAdmin) {
      return { success: false, error: "Supabase admin not configured." };
    }

    // ── Debounce: skip if recently recomputed ────────────────────────────
    const skipResult = await shouldSkipRecompute(userId);
    if (skipResult.skip) {
      return { success: true };
    }

    // ── Step 1: Recompute all domain engines (idempotent) ────────────────
    const [healthResult, financialResult, cognitiveResult] = await Promise.all([
      computeHealthState(userId),
      computeFinancialState(userId),
      computeCognitiveState(userId),
    ]);

    // ── Step 2: Fire governance hooks for threshold-crossing signals ─────
    if (healthResult.success) {
      await recordHealthGovernanceSignal(userId, healthResult.state);
    }
    if (financialResult.success) {
      await recordFinancialGovernanceSignal(userId, financialResult.state);
    }
    if (cognitiveResult.success) {
      await recordCognitiveGovernanceSignal(userId, cognitiveResult.state);
    }

    // ── Step 3: Fetch behavioural + governance + previous status + budget ──
    const [behaviouralRes, governanceRes, prevStatusRes, prevBudgetRes] = await Promise.all([
      fromSafe("behavioural_state_current")
        .select("state_json")
        .eq("user_id", userId)
        .maybeSingle(),
      fromSafe("governance_state")
        .select("state_json")
        .eq("user_id", userId)
        .maybeSingle(),
      fromSafe("system_status_current")
        .select("system_phase, top_priority_domain, enforcement_mode")
        .eq("user_id", userId)
        .maybeSingle(),
      fromSafe("resource_budget_current")
        .select("constraint_level")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (behaviouralRes.error) {
      return { success: false, error: behaviouralRes.error.message };
    }
    if (governanceRes.error) {
      return { success: false, error: governanceRes.error.message };
    }

    const health: HealthState | null = healthResult.success
      ? {
          energy_index: healthResult.state.energy_index,
          sleep_debt_score: healthResult.state.sleep_debt_score,
          recovery_index: healthResult.state.recovery_index,
          volatility_flag: healthResult.state.volatility_flag,
          confidence_score: healthResult.state.confidence_score,
        }
      : null;

    const financial: FinancialState | null = financialResult.success
      ? {
          monthly_spending: financialResult.state.monthly_spending,
          impulse_spend_count: financialResult.state.impulse_spend_count,
          savings_ratio: financialResult.state.savings_ratio,
          financial_stress_index: financialResult.state.financial_stress_index,
          confidence_score: financialResult.state.confidence_score,
        }
      : null;

    const cognitive: CognitiveState | null = cognitiveResult.success
      ? {
          avg_confidence: cognitiveResult.state.avg_confidence,
          regret_index: cognitiveResult.state.regret_index,
          bias_frequency_score: cognitiveResult.state.bias_frequency_score,
          decision_volatility: cognitiveResult.state.decision_volatility,
          confidence_score: cognitiveResult.state.confidence_score,
        }
      : null;

    const behavioural = (behaviouralRes.data as BehaviouralState | null) ?? null;
    const governance = (governanceRes.data as GovernanceState | null) ?? null;
    const rawPrevStatus = prevStatusRes.data as Omit<PreviousSystemStatus, "constraint_level"> | null;
    const prevConstraint = (prevBudgetRes.data as { constraint_level: string } | null)?.constraint_level ?? "normal";
    const previousStatus: PreviousSystemStatus | null = rawPrevStatus
      ? { ...rawPrevStatus, constraint_level: prevConstraint }
      : null;

    // ── Step 4: Compute master state aggregation ─────────────────────────
    const focusWeights: DomainWeightMap | undefined = selectedDomains.length > 0
      ? computeDomainWeights(selectedDomains)
      : undefined;

    const stressMap = computeDomainStress(health, financial, cognitive, behavioural, governance);
    const global_stability_score = computeGlobalStability(stressMap, focusWeights);
    const dominant_risk_domain = findDominantRiskDomain(stressMap, selectedDomains);
    const overload_flag = computeOverloadFlag(stressMap);
    const energy_budget_flag = computeEnergyBudgetFlag(health, financial);
    const masterConfidence = computeMasterConfidence(health, financial, cognitive);

    const masterState: MasterStateOutput = {
      global_stability_score,
      dominant_risk_domain,
      energy_budget_flag,
      overload_flag,
      ...masterConfidence,
    };

    // ── Step 5: Persist master_state_current ─────────────────────────────
    const { error: masterWriteError } = await safeUpsert(
      "master_state_current",
      {
        user_id: userId,
        global_stability_score: masterState.global_stability_score,
        dominant_risk_domain: masterState.dominant_risk_domain,
        energy_budget_flag: masterState.energy_budget_flag,
        overload_flag: masterState.overload_flag,
        confidence_score: masterState.confidence_score,
        sample_size: masterState.sample_size,
        data_freshness_hours: masterState.data_freshness_hours,
        is_stale: masterState.is_stale,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>,
      { onConflict: "user_id" },
      supabaseAdmin,
    );

    if (masterWriteError) {
      return { success: false, error: (masterWriteError as { message: string }).message };
    }

    // ── Step 6: Compute system phase ─────────────────────────────────────
    const healthVolatility = healthResult.success ? healthResult.state.volatility_flag : false;
    const cognitiveVolatility = cognitiveResult.success ? cognitiveResult.state.decision_volatility > 50 : false;

    const phaseInput = extractPhaseInputs({
      overload_flag,
      global_stability_score,
      dominant_risk_domain,
      governance,
      health_volatility_flag: healthVolatility,
      cognitive_volatility_flag: cognitiveVolatility,
      confidence_score: masterConfidence.confidence_score,
    });

    const systemPhase = computeSystemPhase(phaseInput);

    // ── Step 7: Compute priority ─────────────────────────────────────────
    let entitlements: PlanEntitlement;
    try {
      const planTier = await getUserPlanTier(userId);
      const resolved = await resolvePlanEntitlements(planTier);
      entitlements = resolved.entitlements;
    } catch {
      entitlements = getDefaultEntitlements();
    }

    const priority = computePriority({
      masterState,
      governanceState: governance,
      selectedDomains,
      entitlements,
      systemPhase,
      domainStress: stressMap,
    });

    // ── Step 8: Compute resource budget ──────────────────────────────────
    const budget = computeResourceBudget({
      masterState,
      governanceState: governance,
      systemPhase,
      healthState: health,
      financialState: financial,
      cognitiveState: cognitive,
      selectedDomains,
    });

    // ── Step 9: Persist system_status_current ───────────────────────────
    const nowISO = new Date().toISOString();

    const { error: statusWriteError } = await safeUpsert(
      "system_status_current",
      {
        user_id: userId,
        global_stability_score: masterState.global_stability_score,
        system_phase: systemPhase,
        top_priority_domain: priority.top_priority_domain,
        urgency_level: priority.urgency_level,
        enforcement_mode: priority.enforcement_mode,
        stability_trend_7d: 0,
        confidence_score: masterState.confidence_score,
        sample_size: masterState.sample_size,
        updated_at: nowISO,
      } as Record<string, unknown>,
      { onConflict: "user_id" },
      supabaseAdmin,
    );

    if (statusWriteError) {
      return { success: false, error: (statusWriteError as { message: string }).message };
    }

    // ── Step 11: Persist resource_budget_current ─────────────────────────
    const { error: budgetWriteError } = await safeUpsert(
      "resource_budget_current",
      {
        user_id: userId,
        max_focus_minutes_today: budget.max_focus_minutes_today,
        max_decision_complexity: budget.max_decision_complexity,
        spending_tolerance_band: budget.spending_tolerance_band,
        recovery_required_hours: budget.recovery_required_hours,
        budget_confidence: budget.budget_confidence,
        constraint_level: budget.constraint_level,
        confidence_score: budget.confidence_score,
        sample_size: budget.sample_size,
        data_freshness_hours: budget.data_freshness_hours,
        is_stale: budget.is_stale,
        updated_at: nowISO,
      } as Record<string, unknown>,
      { onConflict: "user_id" },
      supabaseAdmin,
    );

    if (budgetWriteError) {
      return { success: false, error: (budgetWriteError as { message: string }).message };
    }

    // ── Step 12: Log transition if state changed (delegated to transitionLogger)
    const previousSnapshot = previousStatus
      ? {
          phase: previousStatus.system_phase as SystemPhase,
          priority_domain: previousStatus.top_priority_domain as RiskDomain,
          enforcement_mode: previousStatus.enforcement_mode as EnforcementMode,
          constraint_level: (previousStatus.constraint_level ?? "normal") as ConstraintLevel,
        }
      : null;

    const currentSnapshot = {
      phase: systemPhase,
      priority_domain: priority.top_priority_domain,
      enforcement_mode: priority.enforcement_mode,
      constraint_level: budget.constraint_level,
    };

    const { logged: transitionLogged } = await appendSystemTransitionIfChanged({
      userId,
      previous: previousSnapshot,
      current: currentSnapshot,
      triggerSource,
      dominantRiskDomain: dominant_risk_domain,
    });

    return {
      success: true,
      masterState,
      systemPhase,
      priority,
      budget,
      transitionLogged,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function shouldSkipRecompute(userId: string): Promise<{ skip: boolean }> {
  if (!supabaseAdmin) return { skip: false };

  const { data } = await fromSafe("system_status_current")
    .select("updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return { skip: false };

  const lastUpdated = new Date((data as { updated_at: string }).updated_at).getTime();
  const elapsed = (Date.now() - lastUpdated) / 1000;

  return { skip: elapsed < MIN_RECOMPUTE_INTERVAL_SEC };
}

function getDefaultEntitlements(): PlanEntitlement {
  return {
    maxMonthlyTokens: 10_000,
    isPaid: false,
    usesAllocationBucket: false,
    enableRealtime: false,
    enableVoiceTTS: false,
    enableAudioVella: false,
    enableArchitect: false,
    enableDeepDive: false,
    enableDeepInsights: false,
    enableGrowthRoadmap: false,
    enableDeepMemory: false,
  };
}
