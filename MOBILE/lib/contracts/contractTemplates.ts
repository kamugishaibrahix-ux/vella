/**
 * Contract Template Bank — Deterministic intervention template registry.
 * No AI, no free text. Pure deterministic lookup.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Domain =
  | "health"
  | "finance"
  | "cognitive"
  | "performance"
  | "recovery"
  | "addiction"
  | "relationships"
  | "identity";

export type SeverityBand = "low" | "moderate" | "high";

export type EnforcementCompatibility =
  | "observe"
  | "soft"
  | "strict"
  | "any";

export interface ContractTemplate {
  id: string;
  domain: Domain;
  severity: SeverityBand;
  maxFrequencyPerWeek: number;
  budgetWeight: number; // 1–5
  recommendedDays: number; // 3–7
  enforcementCompatibility: EnforcementCompatibility;
}

// ---------------------------------------------------------------------------
// Template Registry
// ---------------------------------------------------------------------------

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  // ── Health ────────────────────────────────────────────────────────────
  {
    id: "health_sleep_regularisation_low",
    domain: "health",
    severity: "low",
    maxFrequencyPerWeek: 1,
    budgetWeight: 2,
    recommendedDays: 4,
    enforcementCompatibility: "any",
  },
  {
    id: "health_sleep_regularisation_high",
    domain: "health",
    severity: "high",
    maxFrequencyPerWeek: 1,
    budgetWeight: 4,
    recommendedDays: 6,
    enforcementCompatibility: "soft",
  },

  // ── Finance ───────────────────────────────────────────────────────────
  {
    id: "finance_spending_pause",
    domain: "finance",
    severity: "moderate",
    maxFrequencyPerWeek: 1,
    budgetWeight: 3,
    recommendedDays: 5,
    enforcementCompatibility: "soft",
  },
  {
    id: "finance_impulse_cooldown",
    domain: "finance",
    severity: "high",
    maxFrequencyPerWeek: 2,
    budgetWeight: 4,
    recommendedDays: 3,
    enforcementCompatibility: "strict",
  },

  // ── Cognitive ─────────────────────────────────────────────────────────
  {
    id: "cognitive_decision_delay_rule",
    domain: "cognitive",
    severity: "high",
    maxFrequencyPerWeek: 1,
    budgetWeight: 3,
    recommendedDays: 5,
    enforcementCompatibility: "soft",
  },
  {
    id: "cognitive_focus_block",
    domain: "cognitive",
    severity: "low",
    maxFrequencyPerWeek: 3,
    budgetWeight: 2,
    recommendedDays: 3,
    enforcementCompatibility: "any",
  },

  // ── Performance ───────────────────────────────────────────────────────
  {
    id: "performance_energy_conservation",
    domain: "performance",
    severity: "moderate",
    maxFrequencyPerWeek: 2,
    budgetWeight: 3,
    recommendedDays: 4,
    enforcementCompatibility: "observe",
  },
  {
    id: "performance_overcommitment_guard",
    domain: "performance",
    severity: "high",
    maxFrequencyPerWeek: 1,
    budgetWeight: 5,
    recommendedDays: 7,
    enforcementCompatibility: "strict",
  },

  // ── Recovery ──────────────────────────────────────────────────────────
  {
    id: "recovery_rest_mandate",
    domain: "recovery",
    severity: "high",
    maxFrequencyPerWeek: 1,
    budgetWeight: 5,
    recommendedDays: 7,
    enforcementCompatibility: "strict",
  },
  {
    id: "recovery_gentle_reentry",
    domain: "recovery",
    severity: "low",
    maxFrequencyPerWeek: 2,
    budgetWeight: 2,
    recommendedDays: 4,
    enforcementCompatibility: "observe",
  },

  // ── Addiction ─────────────────────────────────────────────────────────
  {
    id: "addiction_trigger_avoidance",
    domain: "addiction",
    severity: "high",
    maxFrequencyPerWeek: 1,
    budgetWeight: 5,
    recommendedDays: 7,
    enforcementCompatibility: "strict",
  },
  {
    id: "addiction_craving_delay",
    domain: "addiction",
    severity: "moderate",
    maxFrequencyPerWeek: 3,
    budgetWeight: 3,
    recommendedDays: 3,
    enforcementCompatibility: "soft",
  },

  // ── Relationships ─────────────────────────────────────────────────────
  {
    id: "relationships_boundary_enforcement",
    domain: "relationships",
    severity: "moderate",
    maxFrequencyPerWeek: 2,
    budgetWeight: 3,
    recommendedDays: 5,
    enforcementCompatibility: "soft",
  },
  {
    id: "relationships_conflict_cooldown",
    domain: "relationships",
    severity: "high",
    maxFrequencyPerWeek: 1,
    budgetWeight: 4,
    recommendedDays: 3,
    enforcementCompatibility: "strict",
  },

  // ── Identity ──────────────────────────────────────────────────────────
  {
    id: "identity_value_alignment_check",
    domain: "identity",
    severity: "low",
    maxFrequencyPerWeek: 1,
    budgetWeight: 2,
    recommendedDays: 7,
    enforcementCompatibility: "observe",
  },
  {
    id: "identity_role_overload_guard",
    domain: "identity",
    severity: "high",
    maxFrequencyPerWeek: 1,
    budgetWeight: 4,
    recommendedDays: 5,
    enforcementCompatibility: "soft",
  },
];

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

export function getTemplatesForDomain(
  domain: Domain,
  severity: SeverityBand,
): ContractTemplate[] {
  return CONTRACT_TEMPLATES.filter(
    (t) => t.domain === domain && t.severity === severity,
  );
}

export function getTemplateById(id: string): ContractTemplate | null {
  return CONTRACT_TEMPLATES.find((t) => t.id === id) ?? null;
}
