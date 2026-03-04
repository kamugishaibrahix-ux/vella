/**
 * Cross-Domain Risk Aggregator (deterministic only).
 * Reads all domain state_current tables and governance_state.
 * Computes global_stability_score, dominant_risk_domain, energy_budget_flag, overload_flag.
 * Supports focus-area weighting and confidence scoring.
 * Does NOT replace governance engine. Aggregates domain signals only.
 * No AI. No narrative. Pure rules. Upserts master_state_current only.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeUpsert } from "@/lib/safe/safeSupabaseWrite";
import { computeDomainWeights, type DomainWeightMap } from "@/lib/system/focusWeights";
import type { FocusDomain } from "@/lib/focusAreas";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskDomain = "health" | "financial" | "cognitive" | "behavioural" | "governance" | "none";

export interface HealthState {
  energy_index: number;
  sleep_debt_score: number;
  recovery_index: number;
  volatility_flag: boolean;
  confidence_score?: number;
}

export interface FinancialState {
  monthly_spending: number;
  impulse_spend_count: number;
  savings_ratio: number;
  financial_stress_index: number;
  confidence_score?: number;
}

export interface CognitiveState {
  avg_confidence: number;
  regret_index: number;
  bias_frequency_score: number;
  decision_volatility: number;
  confidence_score?: number;
}

export interface BehaviouralState {
  state_json: {
    progress?: { journal_count?: number; checkin_count?: number };
    connection_depth?: number;
  };
}

export interface GovernanceState {
  state_json: {
    governance_risk_score?: number;
    recovery_state?: string;
    discipline_state?: string;
    focus_state?: string;
    escalation_level?: number;
  };
}

export interface MasterStateOutput {
  global_stability_score: number;
  dominant_risk_domain: RiskDomain;
  energy_budget_flag: boolean;
  overload_flag: boolean;
  confidence_score: number;
  sample_size: number;
  data_freshness_hours: number;
  is_stale: boolean;
}

export type ComputeMasterStateResult =
  | { success: true; state: MasterStateOutput }
  | { success: false; error: string };

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_DOMAIN_WEIGHTS = {
  health: 0.25,
  financial: 0.20,
  cognitive: 0.25,
  behavioural: 0.15,
  governance: 0.15,
} as const;

const OVERLOAD_THRESHOLD = 2;
const ENERGY_BUDGET_SLEEP_DEBT_THRESHOLD = 60;
export const DOMAIN_STRESS_THRESHOLD = 60;

// ─── Pure computation functions (exported for testing) ──────────────────────

/**
 * Compute domain-specific stress score (0–100).
 * Each domain has its own stress derivation.
 */
export function computeDomainStress(
  health: HealthState | null,
  financial: FinancialState | null,
  cognitive: CognitiveState | null,
  behavioural: BehaviouralState | null,
  governance: GovernanceState | null,
): Record<RiskDomain, number> {
  const healthStress = health
    ? Math.round(
        (health.sleep_debt_score * 0.4) +
        ((100 - health.recovery_index) * 0.3) +
        ((100 - health.energy_index) * 0.2) +
        (health.volatility_flag ? 10 : 0),
      )
    : 0;

  const financialStress = financial ? financial.financial_stress_index : 0;

  const cognitiveStress = cognitive
    ? Math.round(
        (cognitive.regret_index * 0.35) +
        (cognitive.decision_volatility * 0.30) +
        (cognitive.bias_frequency_score * 0.25) +
        ((10 - cognitive.avg_confidence) / 10 * 10),
      )
    : 0;

  const behaviouralStress = behavioural
    ? computeBehaviouralStress(behavioural)
    : 0;

  const govRisk = governance?.state_json?.governance_risk_score ?? 0;
  const governanceStress = Math.round((govRisk / 10) * 100);

  return {
    health: Math.min(100, Math.max(0, healthStress)),
    financial: Math.min(100, Math.max(0, financialStress)),
    cognitive: Math.min(100, Math.max(0, cognitiveStress)),
    behavioural: Math.min(100, Math.max(0, behaviouralStress)),
    governance: Math.min(100, Math.max(0, governanceStress)),
    none: 0,
  };
}

function computeBehaviouralStress(b: BehaviouralState): number {
  const connectionDepth = b.state_json?.connection_depth ?? 5;
  return Math.round(Math.max(0, (10 - connectionDepth) * 10));
}

/**
 * Global stability = 100 – weighted stress composite.
 * Non-linear amplification when multiple domains exceed stress threshold.
 * Supports focus-area weighting override.
 */
export function computeGlobalStability(
  stressMap: Record<RiskDomain, number>,
  weights?: DomainWeightMap,
): number {
  const w = weights ?? DEFAULT_DOMAIN_WEIGHTS;

  const weightedStress =
    stressMap.health * w.health +
    stressMap.financial * w.financial +
    stressMap.cognitive * w.cognitive +
    stressMap.behavioural * w.behavioural +
    stressMap.governance * w.governance;

  const domainKeys: (keyof typeof DEFAULT_DOMAIN_WEIGHTS)[] = [
    "health", "financial", "cognitive", "behavioural", "governance",
  ];
  const elevatedCount = domainKeys.filter(
    (k) => stressMap[k] > DOMAIN_STRESS_THRESHOLD,
  ).length;

  let amplifiedStress = weightedStress;
  if (elevatedCount >= 2) {
    amplifiedStress *= 1 + (elevatedCount - 1) * 0.15;
  }

  return Math.round(Math.min(100, Math.max(0, 100 - amplifiedStress)));
}

/**
 * Dominant risk domain: the domain with the highest stress.
 * Returns "none" if all domains are below threshold.
 * When selected focus domains are provided, ties are broken in favour of
 * selected domains (within 5-point margin).
 */
export function findDominantRiskDomain(
  stressMap: Record<RiskDomain, number>,
  selectedDomains?: FocusDomain[],
): RiskDomain {
  const domainKeys: (keyof typeof DEFAULT_DOMAIN_WEIGHTS)[] = [
    "health", "financial", "cognitive", "behavioural", "governance",
  ];

  let maxStress = 0;
  let dominant: RiskDomain = "none";

  for (const key of domainKeys) {
    if (stressMap[key] > maxStress) {
      maxStress = stressMap[key];
      dominant = key;
    }
  }

  if (maxStress <= DOMAIN_STRESS_THRESHOLD) return "none";

  if (selectedDomains && selectedDomains.length > 0) {
    const FOCUS_DOMAIN_TO_RISK: Partial<Record<FocusDomain, RiskDomain>> = {
      "physical-health": "health",
      "financial-discipline": "financial",
      "emotional-intelligence": "cognitive",
      "performance-focus": "cognitive",
      "self-mastery": "behavioural",
      "addiction-recovery": "governance",
    };
    const selectedRisk = new Set(
      selectedDomains.map((fd) => FOCUS_DOMAIN_TO_RISK[fd]).filter(Boolean) as RiskDomain[],
    );

    const TIE_MARGIN = 5;
    for (const key of domainKeys) {
      if (
        key !== dominant &&
        selectedRisk.has(key) &&
        !selectedRisk.has(dominant) &&
        stressMap[key] >= maxStress - TIE_MARGIN &&
        stressMap[key] > DOMAIN_STRESS_THRESHOLD
      ) {
        dominant = key;
        break;
      }
    }
  }

  return dominant;
}

/**
 * Overload flag: true when 2+ domains exceed stress threshold simultaneously.
 * Cross-domain amplification rule.
 */
export function computeOverloadFlag(
  stressMap: Record<RiskDomain, number>,
): boolean {
  const domainKeys: (keyof typeof DEFAULT_DOMAIN_WEIGHTS)[] = [
    "health", "financial", "cognitive", "behavioural", "governance",
  ];

  const elevated = domainKeys.filter((k) => stressMap[k] > DOMAIN_STRESS_THRESHOLD).length;
  return elevated >= OVERLOAD_THRESHOLD;
}

/**
 * Energy budget flag: true when sleep debt + financial stress compound.
 * High sleep debt erodes capacity to cope with financial stress.
 */
export function computeEnergyBudgetFlag(
  health: HealthState | null,
  financial: FinancialState | null,
): boolean {
  if (!health || !financial) return false;

  return (
    health.sleep_debt_score > ENERGY_BUDGET_SLEEP_DEBT_THRESHOLD &&
    financial.financial_stress_index > DOMAIN_STRESS_THRESHOLD
  );
}

/**
 * Aggregate confidence across domain engines.
 * Master confidence = minimum of available domain confidences.
 * If no domain data exists at all, confidence=0, is_stale=true.
 */
export function computeMasterConfidence(
  health: HealthState | null,
  financial: FinancialState | null,
  cognitive: CognitiveState | null,
): { confidence_score: number; sample_size: number; data_freshness_hours: number; is_stale: boolean } {
  const scores: number[] = [];
  if (health?.confidence_score !== undefined) scores.push(health.confidence_score);
  if (financial?.confidence_score !== undefined) scores.push(financial.confidence_score);
  if (cognitive?.confidence_score !== undefined) scores.push(cognitive.confidence_score);

  if (scores.length === 0) {
    return { confidence_score: 0, sample_size: 0, data_freshness_hours: 999, is_stale: true };
  }

  const minConfidence = Math.min(...scores);
  const anyStale = scores.some((s) => s === 0);

  return {
    confidence_score: minConfidence,
    sample_size: scores.length,
    data_freshness_hours: 0,
    is_stale: anyStale || minConfidence === 0,
  };
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export async function computeMasterState(
  userId: string,
  selectedDomains?: FocusDomain[],
): Promise<ComputeMasterStateResult> {
  try {
    const [healthRes, financialRes, cognitiveRes, behaviouralRes, governanceRes] =
      await Promise.all([
        fromSafe("health_state_current")
          .select("energy_index, sleep_debt_score, recovery_index, volatility_flag, confidence_score")
          .eq("user_id", userId)
          .maybeSingle(),
        fromSafe("financial_state_current")
          .select("monthly_spending, impulse_spend_count, savings_ratio, financial_stress_index, confidence_score")
          .eq("user_id", userId)
          .maybeSingle(),
        fromSafe("cognitive_state_current")
          .select("avg_confidence, regret_index, bias_frequency_score, decision_volatility, confidence_score")
          .eq("user_id", userId)
          .maybeSingle(),
        fromSafe("behavioural_state_current")
          .select("state_json")
          .eq("user_id", userId)
          .maybeSingle(),
        fromSafe("governance_state")
          .select("state_json")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

    for (const res of [healthRes, financialRes, cognitiveRes, behaviouralRes, governanceRes]) {
      if (res.error) {
        return { success: false, error: res.error.message };
      }
    }

    const health = (healthRes.data as HealthState | null) ?? null;
    const financial = (financialRes.data as FinancialState | null) ?? null;
    const cognitive = (cognitiveRes.data as CognitiveState | null) ?? null;
    const behavioural = (behaviouralRes.data as BehaviouralState | null) ?? null;
    const governance = (governanceRes.data as GovernanceState | null) ?? null;

    const focusWeights = selectedDomains
      ? computeDomainWeights(selectedDomains)
      : undefined;

    const stressMap = computeDomainStress(health, financial, cognitive, behavioural, governance);
    const global_stability_score = computeGlobalStability(stressMap, focusWeights);
    const dominant_risk_domain = findDominantRiskDomain(stressMap, selectedDomains);
    const overload_flag = computeOverloadFlag(stressMap);
    const energy_budget_flag = computeEnergyBudgetFlag(health, financial);
    const masterConfidence = computeMasterConfidence(health, financial, cognitive);

    const state: MasterStateOutput = {
      global_stability_score,
      dominant_risk_domain,
      energy_budget_flag,
      overload_flag,
      ...masterConfidence,
    };

    if (!supabaseAdmin) {
      return { success: false, error: "Supabase admin not configured." };
    }

    const { error: writeError } = await safeUpsert(
      "master_state_current",
      {
        user_id: userId,
        global_stability_score: state.global_stability_score,
        dominant_risk_domain: state.dominant_risk_domain,
        energy_budget_flag: state.energy_budget_flag,
        overload_flag: state.overload_flag,
        confidence_score: state.confidence_score,
        sample_size: state.sample_size,
        data_freshness_hours: state.data_freshness_hours,
        is_stale: state.is_stale,
        updated_at: new Date().toISOString(),
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
