/**
 * Credit Cost Table
 * Fixed credit costs per AI call tier.
 * Replaces variable token estimation with predictable pricing.
 */

export const CREDIT_COST = {
  simple: 5,
  complex: 10,
  deep: 20,
} as const;

export type CreditTier = keyof typeof CREDIT_COST;

/**
 * Per-tier OpenAI max_tokens constraints.
 * Prevents runaway costs from overlong responses.
 */
export const CREDIT_OUTPUT_CAP = {
  simple: 300,
  complex: 700,
  deep: 1500,
} as const;

/**
 * Per-tier memory context character caps.
 * Limits context injection size to control input costs.
 */
export const MEMORY_CHAR_CAP = {
  simple: 800,
  complex: 2000,
  deep: 4000,
} as const;

/**
 * Get credit cost for a tier.
 */
export function getCreditCost(tier: CreditTier): number {
  return CREDIT_COST[tier];
}

/**
 * Get max_tokens limit for OpenAI call.
 */
export function getOutputCapForTier(tier: CreditTier): number {
  return CREDIT_OUTPUT_CAP[tier];
}

/**
 * Get memory context character cap.
 */
export function getMemoryCapForTier(tier: CreditTier): number {
  return MEMORY_CHAR_CAP[tier];
}
