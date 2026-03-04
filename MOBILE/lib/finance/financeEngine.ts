/**
 * Financial Discipline Engine (deterministic only).
 * Computes monthly_spending, impulse_spend_count, savings_ratio, financial_stress_index
 * from financial_entries. Includes confidence scoring, freshness detection, and
 * outlier damping for impulse spikes.
 * No AI. No narrative. Pure rules. Upserts financial_state_current only.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeUpsert } from "@/lib/safe/safeSupabaseWrite";
import {
  computeFullConfidence,
  FINANCIAL_CONFIDENCE,
  dampValue,
  type ConfidenceOutput,
} from "@/lib/system/confidenceScoring";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FinancialEntryRow {
  amount: number;
  category: "income" | "expense" | "savings";
  behavior_flag: "planned" | "impulse";
  recorded_at: string;
  suspicious_input?: boolean;
}

export interface FinancialStateOutput {
  monthly_spending: number;
  impulse_spend_count: number;
  savings_ratio: number;
  financial_stress_index: number;
  confidence_score: number;
  sample_size: number;
  data_freshness_hours: number;
  is_stale: boolean;
}

export type ComputeFinancialStateResult =
  | { success: true; state: FinancialStateOutput }
  | { success: false; error: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_ENTRIES_READ = 500;

export const FINANCIAL_GOVERNANCE_WEIGHT = {
  stress_threshold: 65,
  risk_increment: 1,
} as const;

// ─── Pure computation functions (exported for testing) ──────────────────────

/**
 * Total spending (expense category) within the billing window.
 */
export function computeMonthlySpending(
  entries: Pick<FinancialEntryRow, "amount" | "category">[],
): number {
  return entries
    .filter((e) => e.category === "expense")
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

/**
 * Impulse rate: ratio of impulse transactions to total expense transactions.
 * Returns 0 if no expenses.
 */
export function computeImpulseRate(
  entries: Pick<FinancialEntryRow, "category" | "behavior_flag">[],
): number {
  const expenses = entries.filter((e) => e.category === "expense");
  if (expenses.length === 0) return 0;

  const impulseCount = expenses.filter((e) => e.behavior_flag === "impulse").length;
  return impulseCount / expenses.length;
}

/**
 * Savings ratio: savings / (income + savings). Bounded [0, 1].
 * Returns 0 if no income or savings.
 */
export function computeSavingsRatio(
  entries: Pick<FinancialEntryRow, "amount" | "category">[],
): number {
  const income = entries
    .filter((e) => e.category === "income")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const savings = entries
    .filter((e) => e.category === "savings")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const total = income + savings;
  if (total === 0) return 0;

  return Math.min(1, Math.max(0, savings / total));
}

/**
 * Financial Stress Index (0–100). Composite of:
 * - Impulse rate (40% weight): higher impulse = more stress
 * - Savings ratio inverted (30% weight): lower savings = more stress
 * - Spending volatility proxy (30% weight): spending vs income ratio
 *
 * Non-linear: amplifies when multiple stress signals converge.
 */
export function computeFinancialStress(
  spending: number,
  savingsRatio: number,
  impulseRate: number,
  totalIncome: number,
): number {
  const impulseComponent = impulseRate * 40;

  const savingsComponent = (1 - savingsRatio) * 30;

  let spendingRatio = 0;
  if (totalIncome > 0) {
    spendingRatio = Math.min(2, spending / totalIncome);
  }
  const spendingComponent = (spendingRatio / 2) * 30;

  let raw = impulseComponent + savingsComponent + spendingComponent;

  const stressSignals = [
    impulseRate > 0.3 ? 1 : 0,
    savingsRatio < 0.1 ? 1 : 0,
    spendingRatio > 1.0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  if (stressSignals >= 2) {
    raw = raw * 1.2;
  }
  if (stressSignals >= 3) {
    raw = raw * 1.1;
  }

  return Math.round(Math.min(100, Math.max(0, raw)));
}

// ─── Outlier damping ─────────────────────────────────────────────────────────

const IMPULSE_SPIKE_SOFT_CAP = 10;
const IMPULSE_SPIKE_DAMPING = 0.5;

/**
 * Damp impulse count to prevent single-day spikes from distorting the stress index.
 */
export function dampImpulseCount(rawCount: number): number {
  return Math.round(dampValue(rawCount, IMPULSE_SPIKE_SOFT_CAP, IMPULSE_SPIKE_DAMPING));
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export async function computeFinancialState(
  userId: string,
): Promise<ComputeFinancialStateResult> {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data, error: readError } = await fromSafe("financial_entries")
      .select("amount, category, behavior_flag, recorded_at")
      .eq("user_id", userId)
      .gte("recorded_at", monthStart)
      .order("recorded_at", { ascending: false })
      .limit(MAX_ENTRIES_READ);

    if (readError) {
      return { success: false, error: readError.message };
    }

    const entries = (data ?? []) as FinancialEntryRow[];

    const confidence = computeFullConfidence(
      entries.length,
      entries.length > 0 ? entries[0].recorded_at : null,
      FINANCIAL_CONFIDENCE,
      now,
    );

    if (entries.length === 0) {
      const defaultState: FinancialStateOutput = {
        monthly_spending: 0,
        impulse_spend_count: 0,
        savings_ratio: 0,
        financial_stress_index: 0,
        ...confidence,
      };
      return { success: true, state: defaultState };
    }

    const monthly_spending = computeMonthlySpending(entries);
    const rawImpulseCount = entries.filter(
      (e) => e.category === "expense" && e.behavior_flag === "impulse",
    ).length;
    const impulse_spend_count = dampImpulseCount(rawImpulseCount);
    const impulseRate = computeImpulseRate(entries);
    const savings_ratio = computeSavingsRatio(entries);

    const totalIncome = entries
      .filter((e) => e.category === "income")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const financial_stress_index = computeFinancialStress(
      monthly_spending,
      savings_ratio,
      impulseRate,
      totalIncome,
    );

    const state: FinancialStateOutput = {
      monthly_spending,
      impulse_spend_count,
      savings_ratio: Math.round(savings_ratio * 10000) / 10000,
      financial_stress_index,
      ...confidence,
    };

    if (!supabaseAdmin) {
      return { success: false, error: "Supabase admin not configured." };
    }

    const { error: writeError } = await safeUpsert(
      "financial_state_current",
      {
        user_id: userId,
        monthly_spending: state.monthly_spending,
        impulse_spend_count: state.impulse_spend_count,
        savings_ratio: state.savings_ratio,
        financial_stress_index: state.financial_stress_index,
        confidence_score: state.confidence_score,
        sample_size: state.sample_size,
        data_freshness_hours: state.data_freshness_hours,
        is_stale: state.is_stale,
        updated_at: now.toISOString(),
      } as Record<string, unknown>,
      { onConflict: "user_id" },
      supabaseAdmin,
    );

    if (writeError) {
      return { success: false, error: (writeError as { message: string }).message };
    }

    return { success: true, state };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Evaluates whether financial state warrants governance risk signal.
 * Returns governance signal payload if stress threshold breached; null otherwise.
 */
export function evaluateFinancialGovernanceSignal(state: FinancialStateOutput): {
  risk_increment: number;
  domain_flag: string;
} | null {
  if (state.financial_stress_index <= FINANCIAL_GOVERNANCE_WEIGHT.stress_threshold) {
    return null;
  }

  return {
    risk_increment: FINANCIAL_GOVERNANCE_WEIGHT.risk_increment,
    domain_flag: "financial_instability",
  };
}
