/**
 * Focus Area → Domain Weight Mapping.
 * Converts user-selected focus domains (max 3) into risk-domain weights
 * for the master state aggregator.
 * Selected domains get weight 1.0, unselected get 0.25.
 * Weights are normalised so they sum to 1.0.
 * Deterministic. No AI. No narrative.
 */

import type { FocusDomain } from "@/lib/focusAreas";

export type EngineDomain = "health" | "financial" | "cognitive" | "behavioural" | "governance";

export interface DomainWeightMap {
  health: number;
  financial: number;
  cognitive: number;
  behavioural: number;
  governance: number;
}

const FOCUS_DOMAIN_TO_ENGINE: Record<FocusDomain, EngineDomain[]> = {
  "physical-health": ["health"],
  "financial-discipline": ["financial"],
  "emotional-intelligence": ["cognitive"],
  "performance-focus": ["cognitive"],
  "self-mastery": ["behavioural"],
  "addiction-recovery": ["governance"],
  "relationships": ["behavioural"],
  "identity-purpose": ["behavioural"],
};

const SELECTED_WEIGHT = 1.0;
const UNSELECTED_WEIGHT = 0.25;
const MAX_SELECTED_DOMAINS = 3;

/**
 * Compute domain weights from user's selected focus areas.
 * - Selected domains: weight 1.0
 * - Unselected domains: weight 0.25
 * - Normalised so weights sum to 1.0
 * - Enforces max 3 selected domains (takes first 3 if more provided)
 */
export function computeDomainWeights(
  selectedDomains: FocusDomain[],
): DomainWeightMap {
  const capped = selectedDomains.slice(0, MAX_SELECTED_DOMAINS);

  const selectedEngines = new Set<EngineDomain>();
  for (const fd of capped) {
    const mapped = FOCUS_DOMAIN_TO_ENGINE[fd];
    if (mapped) {
      for (const eng of mapped) {
        selectedEngines.add(eng);
      }
    }
  }

  const allDomains: EngineDomain[] = ["health", "financial", "cognitive", "behavioural", "governance"];

  const rawWeights: DomainWeightMap = {
    health: UNSELECTED_WEIGHT,
    financial: UNSELECTED_WEIGHT,
    cognitive: UNSELECTED_WEIGHT,
    behavioural: UNSELECTED_WEIGHT,
    governance: UNSELECTED_WEIGHT,
  };

  for (const eng of Array.from(selectedEngines)) {
    rawWeights[eng] = SELECTED_WEIGHT;
  }

  const totalRaw = allDomains.reduce((sum, d) => sum + rawWeights[d], 0);
  if (totalRaw === 0) return rawWeights;

  const normalised: DomainWeightMap = {
    health: rawWeights.health / totalRaw,
    financial: rawWeights.financial / totalRaw,
    cognitive: rawWeights.cognitive / totalRaw,
    behavioural: rawWeights.behavioural / totalRaw,
    governance: rawWeights.governance / totalRaw,
  };

  return normalised;
}

/**
 * Returns whether a given engine domain is selected by the user.
 */
export function isDomainSelected(
  domain: EngineDomain,
  selectedDomains: FocusDomain[],
): boolean {
  const capped = selectedDomains.slice(0, MAX_SELECTED_DOMAINS);
  for (const fd of capped) {
    const mapped = FOCUS_DOMAIN_TO_ENGINE[fd];
    if (mapped && mapped.includes(domain)) return true;
  }
  return false;
}
