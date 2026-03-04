/**
 * Stripe Product Configuration
 * Single source of truth for Stripe Price IDs and token top-up mappings.
 * Infrastructure configuration - not marketing copy.
 */

/** Subscription tiers */
export type SubscriptionTier = "pro" | "elite";

/** Token top-up SKUs */
export type TopupSKU = "topup_50k" | "topup_200k" | "topup_1m";

/**
 * Stripe Price IDs from environment variables.
 * These map to products configured in Stripe Dashboard.
 */
export const STRIPE_PRICE_IDS = {
  subscriptions: {
    pro: process.env.STRIPE_PRICE_PRO,
    elite: process.env.STRIPE_PRICE_ELITE,
  } as Record<SubscriptionTier, string | undefined>,
  topups: {
    topup_50k: process.env.STRIPE_PRICE_TOPUP_50K,
    topup_200k: process.env.STRIPE_PRICE_TOPUP_200K,
    topup_1m: process.env.STRIPE_PRICE_TOPUP_1M,
  } as Record<TopupSKU, string | undefined>,
} as const;

/**
 * Token amounts granted for each top-up SKU.
 * These are internal token units, not dollar amounts.
 * CRITICAL: Must match Stripe product configuration.
 */
export const TOPUP_TOKENS: Record<TopupSKU, number> = {
  topup_50k: 50_000,
  topup_200k: 200_000,
  topup_1m: 1_000_000,
} as const;

/**
 * Validate that all required price IDs are configured.
 * Returns list of missing environment variable names.
 */
export function validateStripeConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  // Check subscription price IDs
  if (!STRIPE_PRICE_IDS.subscriptions.pro) missing.push("STRIPE_PRICE_PRO");
  if (!STRIPE_PRICE_IDS.subscriptions.elite) missing.push("STRIPE_PRICE_ELITE");

  // Check top-up price IDs
  if (!STRIPE_PRICE_IDS.topups.topup_50k) missing.push("STRIPE_PRICE_TOPUP_50K");
  if (!STRIPE_PRICE_IDS.topups.topup_200k) missing.push("STRIPE_PRICE_TOPUP_200K");
  if (!STRIPE_PRICE_IDS.topups.topup_1m) missing.push("STRIPE_PRICE_TOPUP_1M");

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get price ID for a subscription tier.
 */
export function getSubscriptionPriceId(tier: SubscriptionTier): string | undefined {
  return STRIPE_PRICE_IDS.subscriptions[tier];
}

/**
 * Get price ID for a top-up SKU.
 */
export function getTopupPriceId(sku: TopupSKU): string | undefined {
  return STRIPE_PRICE_IDS.topups[sku];
}

/**
 * Get token amount for a top-up SKU.
 */
export function getTopupTokens(sku: TopupSKU): number {
  return TOPUP_TOKENS[sku];
}

/**
 * Check if a string is a valid top-up SKU.
 */
export function isValidTopupSKU(sku: string): sku is TopupSKU {
  return sku in TOPUP_TOKENS;
}

/**
 * Check if a string is a valid subscription tier.
 */
export function isValidSubscriptionTier(tier: string): tier is SubscriptionTier {
  return tier === "pro" || tier === "elite";
}
