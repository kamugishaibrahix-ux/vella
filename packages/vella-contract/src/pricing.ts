/**
 * Vella Contract - Pricing Configuration
 * Single source of truth for plan pricing.
 * 
 * UI components and admin panels import from here, never hardcode prices.
 * When Stripe integration is added, this file will be extended with price IDs.
 */

import type { PlanTier } from "./types";

/**
 * Price configuration for a single tier.
 */
export interface TierPricing {
  /** Display price with currency symbol (e.g., "$9") */
  priceLabel: string;
  /** Full price string for display (e.g., "/ month") */
  priceSubtext: string;
  /** Monthly price in cents (for Stripe) */
  monthlyPriceCents: number;
  /** Annual price in cents (if annual billing offered) */
  annualPriceCents?: number;
  /** Annual discount percentage */
  annualDiscountPercent?: number;
}

/**
 * MRR (Monthly Recurring Revenue) calculation data for a tier.
 */
export interface TierMRR {
  tier: PlanTier;
  count: number;
  mrr: number;
  pricePerUser: number;
}

/**
 * Pricing for all tiers.
 * This is the ONLY place prices are defined.
 * 
 * NOTE: These are the MOBILE-actual prices ($9/$29), not the legacy Vella-Control prices.
 * Vella-Control must use these values for revenue calculations.
 */
export const TIER_PRICING: Record<PlanTier, TierPricing> = {
  free: {
    priceLabel: "$0",
    priceSubtext: "/ month",
    monthlyPriceCents: 0,
  },
  pro: {
    priceLabel: "$9",
    priceSubtext: "/ month",
    monthlyPriceCents: 900,
    annualPriceCents: 9000, // $90/year = 2 months free
    annualDiscountPercent: 17,
  },
  elite: {
    priceLabel: "$29",
    priceSubtext: "/ month",
    monthlyPriceCents: 2900,
    annualPriceCents: 29000, // $290/year = 2 months free
    annualDiscountPercent: 17,
  },
};

/**
 * Legacy price mapping for backward compatibility during migration.
 * Maps old price points to current tiers.
 * @deprecated Use TIER_PRICING directly
 */
export const LEGACY_PRICE_MAP: Record<string, number> = {
  // Legacy Vella-Control prices (for reference only)
  "legacy-pro": 4900,   // $49
  "legacy-elite": 19900, // $199
};

/**
 * Get pricing for a specific tier.
 * Never throws - returns free tier for unknown values.
 */
export function getTierPricing(tier: PlanTier | string): TierPricing {
  if (tier === "free" || tier === "pro" || tier === "elite") {
    return TIER_PRICING[tier];
  }
  // Fallback to free for unknown tiers
  console.warn(`[pricing] Unknown tier "${tier}", falling back to free pricing`);
  return TIER_PRICING.free;
}

/**
 * Get monthly price in cents for a tier.
 */
export function getMonthlyPriceCents(tier: PlanTier | string): number {
  return getTierPricing(tier).monthlyPriceCents;
}

/**
 * Get monthly price in dollars for MRR calculations.
 */
export function getMonthlyPriceDollars(tier: PlanTier | string): number {
  return getTierPricing(tier).monthlyPriceCents / 100;
}

/**
 * Format price for display.
 */
export function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  return `$${(cents / 100).toFixed(0)}`;
}

/**
 * Format price with decimal for cents display.
 */
export function formatPriceDecimal(cents: number): string {
  if (cents === 0) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Calculate MRR from subscription counts.
 * Returns array of per-tier MRR data and total.
 */
export function calculateMRR(
  tierCounts: Record<string, number>
): { tiers: TierMRR[]; totalMRR: number } {
  const tiers: TierMRR[] = [];
  let totalMRR = 0;

  for (const [tier, count] of Object.entries(tierCounts)) {
    const pricePerUser = getMonthlyPriceDollars(tier);
    const mrr = count * pricePerUser;
    
    tiers.push({
      tier: tier as PlanTier,
      count,
      mrr,
      pricePerUser,
    });
    
    totalMRR += mrr;
  }

  return { tiers, totalMRR };
}

/**
 * Marketing copy for tiers.
 * Also centralized here - never hardcode in components.
 */
export const TIER_MARKETING: Record<
  PlanTier,
  {
    /** Short marketing headline */
    title: string;
    /** Subtitle description */
    subtitle: string;
    /** Badge shown on card (optional) */
    badge?: string;
  }
> = {
  free: {
    title: "Free",
    subtitle: "Core journaling and chat",
  },
  pro: {
    title: "Pro",
    subtitle: "Full AI feature access",
    badge: "Most Popular",
  },
  elite: {
    title: "Elite",
    subtitle: "Maximum access + deep insights",
    badge: "Best Value",
  },
};

/**
 * Get marketing copy for a specific tier.
 */
export function getTierMarketing(tier: PlanTier | string) {
  if (tier === "free" || tier === "pro" || tier === "elite") {
    return TIER_MARKETING[tier];
  }
  // Fallback
  return {
    title: String(tier),
    subtitle: "Custom plan",
  };
}
