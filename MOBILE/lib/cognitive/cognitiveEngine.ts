/**
 * Cognitive Performance Engine (deterministic only).
 * Computes avg_confidence, regret_index, bias_frequency_score, decision_volatility
 * from decisions and decision_outcomes. Includes confidence scoring, freshness
 * detection, and volatility spike damping.
 * No AI. No narrative. Pure rules. Upserts cognitive_state_current only.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeUpsert } from "@/lib/safe/safeSupabaseWrite";
import {
  computeFullConfidence,
  COGNITIVE_CONFIDENCE,
  dampValue,
  type ConfidenceOutput,
} from "@/lib/system/confidenceScoring";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DecisionRow {
  id: string;
  confidence_score: number;
  emotional_intensity: number;
  recorded_at: string;
  suspicious_input?: boolean;
}

export interface DecisionOutcomeRow {
  decision_id: string;
  outcome_rating: number;
  regret_score: number;
  reviewed_at: string;
}

export interface CognitiveStateOutput {
  avg_confidence: number;
  regret_index: number;
  bias_frequency_score: number;
  decision_volatility: number;
  confidence_score: number;
  sample_size: number;
  data_freshness_hours: number;
  is_stale: boolean;
}

export type ComputeCognitiveStateResult =
  | { success: true; state: CognitiveStateOutput }
  | { success: false; error: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const LOOKBACK_30D = 30;
const MAX_DECISIONS_READ = 300;
const MAX_OUTCOMES_READ = 300;

export const COGNITIVE_GOVERNANCE_WEIGHT = {
  regret_threshold: 60,
  volatility_threshold: 60,
  risk_increment: 1,
} as const;

// ─── Pure computation functions (exported for testing) ──────────────────────

/**
 * Regret index (0–100): weighted average of regret_scores from outcomes.
 * Higher regret = higher index. Scales 1–10 → 0–100.
 */
export function computeRegretIndex(
  outcomes: Pick<DecisionOutcomeRow, "regret_score">[],
): number {
  if (outcomes.length === 0) return 0;

  const avgRegret = outcomes.reduce((sum, o) => sum + o.regret_score, 0) / outcomes.length;
  return Math.round(Math.min(100, Math.max(0, ((avgRegret - 1) / 9) * 100)));
}

/**
 * Confidence drift: standard deviation of confidence_scores.
 * High drift signals inconsistent self-assessment.
 * Returns 0–100 (scaled from raw stddev).
 */
export function computeConfidenceDrift(
  decisions: Pick<DecisionRow, "confidence_score">[],
): number {
  if (decisions.length < 2) return 0;

  const scores = decisions.map((d) => d.confidence_score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);

  return Math.round(Math.min(100, Math.max(0, (stddev / 4.5) * 100)));
}

/**
 * Decision volatility: rate of large swings in confidence between consecutive decisions.
 * A swing > 3 points is considered volatile. Returns percentage (0–100).
 */
export function computeDecisionVolatility(
  decisions: Pick<DecisionRow, "confidence_score" | "recorded_at">[],
): number {
  if (decisions.length < 2) return 0;

  const sorted = [...decisions].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  let volatileCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].confidence_score - sorted[i - 1].confidence_score) > 3) {
      volatileCount++;
    }
  }

  const rate = volatileCount / (sorted.length - 1);
  return Math.round(Math.min(100, Math.max(0, rate * 100)));
}

/**
 * Bias frequency score (0–100): proxy for cognitive bias occurrence.
 * Measures cases where high emotional_intensity + low confidence_score co-occur,
 * or where high confidence + high regret co-occur (overconfidence bias).
 *
 * distortionSignals: pre-computed array of boolean flags per decision indicating
 * whether a bias pattern was detected.
 */
export function computeBiasFrequency(
  decisions: Pick<DecisionRow, "confidence_score" | "emotional_intensity">[],
  outcomes: Pick<DecisionOutcomeRow, "decision_id" | "regret_score">[],
  decisionIds: string[],
): number {
  if (decisions.length === 0) return 0;

  let biasCount = 0;

  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    const emotionalBias = d.emotional_intensity >= 7 && d.confidence_score <= 4;
    if (emotionalBias) {
      biasCount++;
      continue;
    }

    const decisionId = decisionIds[i];
    const outcome = outcomes.find((o) => o.decision_id === decisionId);
    if (outcome && d.confidence_score >= 8 && outcome.regret_score >= 7) {
      biasCount++;
    }
  }

  const rate = biasCount / decisions.length;
  return Math.round(Math.min(100, Math.max(0, rate * 100)));
}

// ─── Outlier damping ─────────────────────────────────────────────────────────

const VOLATILITY_SOFT_CAP = 80;
const VOLATILITY_DAMPING = 0.6;

/**
 * Damp extreme volatility scores to prevent single-session spikes
 * from distorting the cognitive state.
 */
export function dampVolatilityScore(raw: number): number {
  return Math.round(dampValue(raw, VOLATILITY_SOFT_CAP, VOLATILITY_DAMPING));
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export async function computeCognitiveState(
  userId: string,
): Promise<ComputeCognitiveStateResult> {
  try {
    const now = new Date();
    const window30d = new Date(now.getTime() - LOOKBACK_30D * 24 * 60 * 60 * 1000).toISOString();

    const [decisionsRes, outcomesRes] = await Promise.all([
      fromSafe("decisions")
        .select("id, confidence_score, emotional_intensity, recorded_at")
        .eq("user_id", userId)
        .gte("recorded_at", window30d)
        .order("recorded_at", { ascending: false })
        .limit(MAX_DECISIONS_READ),
      fromSafe("decision_outcomes")
        .select("decision_id, outcome_rating, regret_score, reviewed_at")
        .eq("user_id", userId)
        .gte("reviewed_at", window30d)
        .order("reviewed_at", { ascending: false })
        .limit(MAX_OUTCOMES_READ),
    ]);

    if (decisionsRes.error) {
      return { success: false, error: decisionsRes.error.message };
    }
    if (outcomesRes.error) {
      return { success: false, error: outcomesRes.error.message };
    }

    const decisions = (decisionsRes.data ?? []) as DecisionRow[];
    const outcomes = (outcomesRes.data ?? []) as DecisionOutcomeRow[];

    const confidence = computeFullConfidence(
      decisions.length,
      decisions.length > 0 ? decisions[0].recorded_at : null,
      COGNITIVE_CONFIDENCE,
      now,
    );

    if (decisions.length === 0) {
      const defaultState: CognitiveStateOutput = {
        avg_confidence: 5,
        regret_index: 0,
        bias_frequency_score: 0,
        decision_volatility: 0,
        ...confidence,
      };
      return { success: true, state: defaultState };
    }

    const avg_confidence = Math.round(
      (decisions.reduce((sum, d) => sum + d.confidence_score, 0) / decisions.length) * 100,
    ) / 100;

    const regret_index = computeRegretIndex(outcomes);
    const rawVolatility = computeDecisionVolatility(decisions);
    const decision_volatility = dampVolatilityScore(rawVolatility);
    const bias_frequency_score = computeBiasFrequency(
      decisions,
      outcomes,
      decisions.map((d) => d.id),
    );

    const state: CognitiveStateOutput = {
      avg_confidence,
      regret_index,
      bias_frequency_score,
      decision_volatility,
      ...confidence,
    };

    if (!supabaseAdmin) {
      return { success: false, error: "Supabase admin not configured." };
    }

    const { error: writeError } = await safeUpsert(
      "cognitive_state_current",
      {
        user_id: userId,
        avg_confidence: state.avg_confidence,
        regret_index: state.regret_index,
        bias_frequency_score: state.bias_frequency_score,
        decision_volatility: state.decision_volatility,
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
 * Evaluates whether cognitive state warrants governance risk signal.
 * Returns governance signal payload if thresholds breached; null otherwise.
 */
export function evaluateCognitiveGovernanceSignal(state: CognitiveStateOutput): {
  risk_increment: number;
  checkin_frequency_flag: boolean;
  domain_flag: string;
} | null {
  const breached =
    state.regret_index > COGNITIVE_GOVERNANCE_WEIGHT.regret_threshold ||
    state.decision_volatility > COGNITIVE_GOVERNANCE_WEIGHT.volatility_threshold;

  if (!breached) return null;

  return {
    risk_increment: COGNITIVE_GOVERNANCE_WEIGHT.risk_increment,
    checkin_frequency_flag: true,
    domain_flag: "cognitive_instability",
  };
}
