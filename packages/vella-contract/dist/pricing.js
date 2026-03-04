"use strict";
/**
 * Vella Contract - Pricing Configuration
 * Single source of truth for plan pricing.
 *
 * UI components and admin panels import from here, never hardcode prices.
 * When Stripe integration is added, this file will be extended with price IDs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_MARKETING = exports.LEGACY_PRICE_MAP = exports.TIER_PRICING = void 0;
exports.getTierPricing = getTierPricing;
exports.getMonthlyPriceCents = getMonthlyPriceCents;
exports.getMonthlyPriceDollars = getMonthlyPriceDollars;
exports.formatPrice = formatPrice;
exports.formatPriceDecimal = formatPriceDecimal;
exports.calculateMRR = calculateMRR;
exports.getTierMarketing = getTierMarketing;
/**
 * Pricing for all tiers.
 * This is the ONLY place prices are defined.
 *
 * NOTE: These are the MOBILE-actual prices ($9/$29), not the legacy Vella-Control prices.
 * Vella-Control must use these values for revenue calculations.
 */
exports.TIER_PRICING = {
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
exports.LEGACY_PRICE_MAP = {
    // Legacy Vella-Control prices (for reference only)
    "legacy-pro": 4900, // $49
    "legacy-elite": 19900, // $199
};
/**
 * Get pricing for a specific tier.
 * Never throws - returns free tier for unknown values.
 */
function getTierPricing(tier) {
    if (tier === "free" || tier === "pro" || tier === "elite") {
        return exports.TIER_PRICING[tier];
    }
    // Fallback to free for unknown tiers
    console.warn(`[pricing] Unknown tier "${tier}", falling back to free pricing`);
    return exports.TIER_PRICING.free;
}
/**
 * Get monthly price in cents for a tier.
 */
function getMonthlyPriceCents(tier) {
    return getTierPricing(tier).monthlyPriceCents;
}
/**
 * Get monthly price in dollars for MRR calculations.
 */
function getMonthlyPriceDollars(tier) {
    return getTierPricing(tier).monthlyPriceCents / 100;
}
/**
 * Format price for display.
 */
function formatPrice(cents) {
    if (cents === 0)
        return "$0";
    return `$${(cents / 100).toFixed(0)}`;
}
/**
 * Format price with decimal for cents display.
 */
function formatPriceDecimal(cents) {
    if (cents === 0)
        return "$0.00";
    return `$${(cents / 100).toFixed(2)}`;
}
/**
 * Calculate MRR from subscription counts.
 * Returns array of per-tier MRR data and total.
 */
function calculateMRR(tierCounts) {
    const tiers = [];
    let totalMRR = 0;
    for (const [tier, count] of Object.entries(tierCounts)) {
        const pricePerUser = getMonthlyPriceDollars(tier);
        const mrr = count * pricePerUser;
        tiers.push({
            tier: tier,
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
exports.TIER_MARKETING = {
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
function getTierMarketing(tier) {
    if (tier === "free" || tier === "pro" || tier === "elite") {
        return exports.TIER_MARKETING[tier];
    }
    // Fallback
    return {
        title: String(tier),
        subtitle: "Custom plan",
    };
}
