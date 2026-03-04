/**
 * Pricing Configuration
 * Single source of truth for plan pricing.
 * 
 * Hardcoded prices (temporary) - will be replaced with Stripe pricing
 * when billing is wired. UI components import from here, never hardcode.
 * 
 * STRIPE INTEGRATION NOTE:
 * When Stripe is added, this file will:
 * 1. Add priceId fields for Stripe Price objects
 * 2. Optionally fetch prices from Stripe (cached)
 * 3. UI remains unchanged - only this file changes
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
 * Pricing for all tiers.
 * This is the ONLY place prices are defined.
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
 * Get pricing for a specific tier.
 */
export function getTierPricing(tier: PlanTier): TierPricing {
  return TIER_PRICING[tier];
}

/**
 * Get marketing copy for a specific tier.
 */
export function getTierMarketing(tier: PlanTier) {
  return TIER_MARKETING[tier];
}

/**
 * Format price for display.
 */
export function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  return `$${(cents / 100).toFixed(0)}`;
}
