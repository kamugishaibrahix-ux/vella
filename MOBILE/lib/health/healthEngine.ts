/**
 * Physical Health & Energy Engine (deterministic only).
 * Computes energy_index, sleep_debt_score, recovery_index, volatility_flag
 * from health_metrics entries. Includes confidence scoring, freshness
 * detection, and outlier damping.
 * No AI. No narrative. Pure rules. Upserts health_state_current only.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeUpsert } from "@/lib/safe/safeSupabaseWrite";
import {
  computeFullConfidence,
  HEALTH_CONFIDENCE,
  dampHealthMetric,
  isHealthMetricSuspicious,
  type ConfidenceOutput,
} from "@/lib/system/confidenceScoring";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealthMetricRow {
  sleep_hours: number;
  sleep_quality: number;
  exercise_minutes: number;
  recovery_score: number;
  energy_level: number;
  recorded_at: string;
  suspicious_input?: boolean;
}

export interface HealthStateOutput {
  energy_index: number;
  sleep_debt_score: number;
  recovery_index: number;
  volatility_flag: boolean;
  confidence_score: number;
  sample_size: number;
  data_freshness_hours: number;
  is_stale: boolean;
}

export type ComputeHealthStateResult =
  | { success: true; state: HealthStateOutput }
  | { success: false; error: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const OPTIMAL_SLEEP_HOURS = 8;
const MAX_SLEEP_DEBT_PER_DAY = 100 / 7;
const LOOKBACK_7D = 7;
const LOOKBACK_3D = 3;
const MAX_METRICS_READ = 200;

// ─── Governance integration weight ──────────────────────────────────────────

export const HEALTH_GOVERNANCE_WEIGHT = {
  sleep_debt_threshold: 70,
  recovery_threshold: 30,
  risk_increment: 1,
} as const;

// ─── Pure computation functions (exported for testing) ──────────────────────

/**
 * Sleep debt accumulates when sleep_hours < optimal (8h).
 * Bounded 0–100. Each night of deficit adds proportional debt.
 * 7-night window; 0 deficit = 0 debt, 7 nights of 0h = 100.
 * Applies outlier damping: sleep_hours > 14 are damped.
 */
export function computeSleepDebt(last7Days: Pick<HealthMetricRow, "sleep_hours">[]): number {
  if (last7Days.length === 0) return 0;

  let totalDebt = 0;
  for (const day of last7Days) {
    const damped = dampHealthMetric({ sleep_hours: day.sleep_hours, exercise_minutes: 0 });
    const deficit = Math.max(0, OPTIMAL_SLEEP_HOURS - damped.sleep_hours);
    totalDebt += (deficit / OPTIMAL_SLEEP_HOURS) * MAX_SLEEP_DEBT_PER_DAY;
  }

  return Math.round(Math.min(100, Math.max(0, totalDebt)));
}

/**
 * Recovery index: weighted combination of exercise engagement and sleep quality.
 * exercise_minutes contributes up to 50 points (caps at 60 min).
 * sleep_quality (1–10) contributes up to 50 points.
 * Applies outlier damping: exercise_minutes > 240 are damped.
 */
export function computeRecoveryIndex(
  exercise: number,
  sleepQuality: number,
): number {
  const damped = dampHealthMetric({ sleep_hours: 8, exercise_minutes: exercise });
  const exerciseComponent = Math.min(50, (damped.exercise_minutes / 60) * 50);
  const sleepComponent = (sleepQuality / 10) * 50;
  return Math.round(Math.min(100, Math.max(0, exerciseComponent + sleepComponent)));
}

/**
 * Energy index: weighted composite of self-reported energy, inverse sleep debt,
 * and recovery index.
 * energy_level (1–10) → 40% weight
 * inverse sleep_debt (0–100, inverted) → 30% weight
 * recovery_index (0–100) → 30% weight
 */
export function computeEnergyIndex(
  energyLevel: number,
  sleepDebt: number,
  recoveryIndex: number,
): number {
  const energyComponent = (energyLevel / 10) * 40;
  const sleepComponent = ((100 - sleepDebt) / 100) * 30;
  const recoveryComponent = (recoveryIndex / 100) * 30;
  return Math.round(Math.min(100, Math.max(0, energyComponent + sleepComponent + recoveryComponent)));
}

/**
 * Volatility: true when energy_level standard deviation over 3 days exceeds threshold.
 * Signals erratic energy patterns requiring governance attention.
 */
export function computeHealthVolatility(
  last3Days: Pick<HealthMetricRow, "energy_level">[],
): boolean {
  if (last3Days.length < 2) return false;

  const levels = last3Days.map((d) => d.energy_level);
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const variance = levels.reduce((sum, l) => sum + (l - mean) ** 2, 0) / levels.length;
  const stddev = Math.sqrt(variance);

  return stddev > 2.5;
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export async function computeHealthState(
  userId: string,
): Promise<ComputeHealthStateResult> {
  try {
    const now = new Date();
    const window7d = new Date(now.getTime() - LOOKBACK_7D * 24 * 60 * 60 * 1000).toISOString();

    const { data, error: readError } = await fromSafe("health_metrics")
      .select("sleep_hours, sleep_quality, exercise_minutes, recovery_score, energy_level, recorded_at")
      .eq("user_id", userId)
      .gte("recorded_at", window7d)
      .order("recorded_at", { ascending: false })
      .limit(MAX_METRICS_READ);

    if (readError) {
      return { success: false, error: readError.message };
    }

    const metrics = (data ?? []) as HealthMetricRow[];

    const confidence = computeFullConfidence(
      metrics.length,
      metrics.length > 0 ? metrics[0].recorded_at : null,
      HEALTH_CONFIDENCE,
      now,
    );

    if (metrics.length === 0) {
      const defaultState: HealthStateOutput = {
        energy_index: 50,
        sleep_debt_score: 0,
        recovery_index: 50,
        volatility_flag: false,
        ...confidence,
      };
      return { success: true, state: defaultState };
    }

    const window3d = new Date(now.getTime() - LOOKBACK_3D * 24 * 60 * 60 * 1000).toISOString();
    const last7 = metrics.slice(0, LOOKBACK_7D);
    const last3 = metrics.filter((m) => m.recorded_at >= window3d).slice(0, LOOKBACK_3D);

    const latestExercise = metrics[0].exercise_minutes;
    const latestSleepQuality = metrics[0].sleep_quality;
    const latestEnergy = metrics[0].energy_level;

    const sleep_debt_score = computeSleepDebt(last7);
    const recovery_index = computeRecoveryIndex(latestExercise, latestSleepQuality);
    const energy_index = computeEnergyIndex(latestEnergy, sleep_debt_score, recovery_index);
    const volatility_flag = computeHealthVolatility(last3);

    const state: HealthStateOutput = {
      energy_index,
      sleep_debt_score,
      recovery_index,
      volatility_flag,
      ...confidence,
    };

    if (!supabaseAdmin) {
      return { success: false, error: "Supabase admin not configured." };
    }

    const { error: writeError } = await safeUpsert(
      "health_state_current",
      {
        user_id: userId,
        energy_index: state.energy_index,
        sleep_debt_score: state.sleep_debt_score,
        recovery_index: state.recovery_index,
        volatility_flag: state.volatility_flag,
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
 * Evaluates whether health state warrants governance risk signal.
 * Returns governance signal payload if thresholds breached; null otherwise.
 */
export function evaluateHealthGovernanceSignal(state: HealthStateOutput): {
  risk_increment: number;
  focus_intensity_reduction: boolean;
  domain_flag: string;
} | null {
  const { sleep_debt_score, recovery_index } = state;

  const breached =
    sleep_debt_score > HEALTH_GOVERNANCE_WEIGHT.sleep_debt_threshold ||
    recovery_index < HEALTH_GOVERNANCE_WEIGHT.recovery_threshold;

  if (!breached) return null;

  return {
    risk_increment: HEALTH_GOVERNANCE_WEIGHT.risk_increment,
    focus_intensity_reduction: true,
    domain_flag: "health_risk",
  };
}
