/**
 * Contract Generation Engine — Deterministic contract selection from template registry.
 * No AI, no DB, no side effects. Pure function.
 */

import {
  type Domain,
  type SeverityBand,
  type ContractTemplate,
  CONTRACT_TEMPLATES,
} from "./contractTemplates";

// ---------------------------------------------------------------------------
// Input / Output Types
// ---------------------------------------------------------------------------

export interface ContractGenerationInput {
  domain: Domain;
  severity: SeverityBand;
  enforcementMode: "observe" | "soft" | "strict";
  selectedDomains: Domain[];
  availableWeeklySlots: number;
  resourceBudgetWeightAvailable: number;
  userTier: "free" | "pro" | "elite";
}

export interface GeneratedContract {
  templateId: string;
  domain: Domain;
  intensity: SeverityBand;
  durationDays: number;
  budgetWeight: number;
  enforcementMode: "observe" | "soft" | "strict";
}

// ---------------------------------------------------------------------------
// Tier Caps (temporary — will move to entitlements layer)
// ---------------------------------------------------------------------------

const TIER_MAX_PER_WEEK: Record<ContractGenerationInput["userTier"], number> = {
  free: 1,
  pro: 3,
  elite: 5,
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function generateContract(
  input: ContractGenerationInput,
): GeneratedContract | null {
  // 1. Domain must be in the user's selected domains
  if (!input.selectedDomains.includes(input.domain)) return null;

  // 2. Observe-only mode does not produce contracts
  if (input.enforcementMode === "observe") return null;

  // 3. Clamp weekly slots to tier ceiling
  const tierCap = TIER_MAX_PER_WEEK[input.userTier];
  const effectiveSlots = Math.min(input.availableWeeklySlots, tierCap);

  // 4. No slots remaining
  if (effectiveSlots <= 0) return null;

  // 5. Filter templates: domain + severity
  const domainMatches = CONTRACT_TEMPLATES.filter(
    (t) => t.domain === input.domain && t.severity === input.severity,
  );

  // 6. Filter by enforcement compatibility
  const compatible = domainMatches.filter(
    (t) =>
      t.enforcementCompatibility === "any" ||
      t.enforcementCompatibility === input.enforcementMode,
  );

  // 7. Sort: lowest budgetWeight first, then shortest recommendedDays
  const sorted = [...compatible].sort(
    (a, b) => a.budgetWeight - b.budgetWeight || a.recommendedDays - b.recommendedDays,
  );

  // 8. Pick first candidate within budget
  const candidate = sorted.find(
    (t) => t.budgetWeight <= input.resourceBudgetWeightAvailable,
  );

  if (!candidate) return null;

  return {
    templateId: candidate.id,
    domain: candidate.domain,
    intensity: candidate.severity,
    durationDays: candidate.recommendedDays,
    budgetWeight: candidate.budgetWeight,
    enforcementMode: input.enforcementMode,
  };
}
