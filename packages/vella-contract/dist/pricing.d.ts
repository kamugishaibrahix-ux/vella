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
export declare const TIER_PRICING: Record<PlanTier, TierPricing>;
/**
 * Legacy price mapping for backward compatibility during migration.
 * Maps old price points to current tiers.
 * @deprecated Use TIER_PRICING directly
 */
export declare const LEGACY_PRICE_MAP: Record<string, number>;
/**
 * Get pricing for a specific tier.
 * Never throws - returns free tier for unknown values.
 */
export declare function getTierPricing(tier: PlanTier | string): TierPricing;
/**
 * Get monthly price in cents for a tier.
 */
export declare function getMonthlyPriceCents(tier: PlanTier | string): number;
/**
 * Get monthly price in dollars for MRR calculations.
 */
export declare function getMonthlyPriceDollars(tier: PlanTier | string): number;
/**
 * Format price for display.
 */
export declare function formatPrice(cents: number): string;
/**
 * Format price with decimal for cents display.
 */
export declare function formatPriceDecimal(cents: number): string;
/**
 * Calculate MRR from subscription counts.
 * Returns array of per-tier MRR data and total.
 */
export declare function calculateMRR(tierCounts: Record<string, number>): {
    tiers: TierMRR[];
    totalMRR: number;
};
/**
 * Marketing copy for tiers.
 * Also centralized here - never hardcode in components.
 */
export declare const TIER_MARKETING: Record<PlanTier, {
    /** Short marketing headline */
    title: string;
    /** Subtitle description */
    subtitle: string;
    /** Badge shown on card (optional) */
    badge?: string;
}>;
/**
 * Get marketing copy for a specific tier.
 */
export declare function getTierMarketing(tier: PlanTier | string): {
    /** Short marketing headline */
    title: string;
    /** Subtitle description */
    subtitle: string;
    /** Badge shown on card (optional) */
    badge?: string;
};
//# sourceMappingURL=pricing.d.ts.map