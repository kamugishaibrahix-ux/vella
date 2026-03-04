"use strict";
/**
 * Vella Contract - Default Entitlements
 * Safe fallback values used when admin config is unavailable or invalid.
 * These are production-safe defaults that ensure the system works
 * even when admin configuration fails.
 *
 * CRITICAL: These values MUST match between MOBILE and Vella-Control.
 * Any change here must be coordinated across both applications.
 *
 * HARDENING: Unknown tiers now fail-closed with explicit error handling.
 * Previously: fallback to free silently
 * Now: explicit error or restricted entitlements based on policy
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ENTITLEMENTS_BY_TIER = exports.DEFAULT_ELITE_ENTITLEMENTS = exports.DEFAULT_PRO_ENTITLEMENTS = exports.DEFAULT_FREE_ENTITLEMENTS = exports.RESTRICTED_ENTITLEMENTS = void 0;
exports.getDefaultEntitlements = getDefaultEntitlements;
exports.getDefaultEntitlementsSafe = getDefaultEntitlementsSafe;
exports.getRestrictedEntitlements = getRestrictedEntitlements;
exports.getTierTokenLimit = getTierTokenLimit;
exports.getTierTokenLimitSafe = getTierTokenLimitSafe;
exports.getTierFeatures = getTierFeatures;
exports.isFeatureEnabledByDefault = isFeatureEnabledByDefault;
exports.isFeatureEnabledByDefaultSafe = isFeatureEnabledByDefaultSafe;
const types_1 = require("./types");
/**
 * Restricted entitlements for unknown/invalid tiers.
 * This is a fail-closed policy - no premium features, minimal tokens.
 * Used when we can't determine the tier but need to provide some entitlements.
 */
exports.RESTRICTED_ENTITLEMENTS = {
    // Minimal token allocation
    maxMonthlyTokens: 1000,
    // All premium features disabled
    enableRealtime: false,
    enableVoiceTTS: false,
    enableAudioVella: false,
    enableArchitect: false,
    enableDeepDive: false,
    enableDeepInsights: false,
    enableGrowthRoadmap: false,
    enableDeepMemory: false,
    // Conservative rate limiting
    requestsPerMinute: 1,
};
/**
 * FREE tier defaults.
 * Core access to basic chat with limited tokens.
 * No premium AI features.
 */
exports.DEFAULT_FREE_ENTITLEMENTS = {
    // Token economy limit - 10k tokens per month
    maxMonthlyTokens: 10000,
    // Feature flags - all premium features disabled
    enableRealtime: false,
    enableVoiceTTS: false,
    enableAudioVella: false,
    enableArchitect: false,
    enableDeepDive: false,
    enableDeepInsights: false,
    enableGrowthRoadmap: false,
    enableDeepMemory: false,
    // Rate limiting - conservative
    requestsPerMinute: 5,
};
/**
 * PRO tier defaults.
 * Full access to most AI features with generous token quota.
 * Excludes elite-only deep insights and deep memory.
 */
exports.DEFAULT_PRO_ENTITLEMENTS = {
    // Token economy limit - 300k tokens per month (30x free tier)
    maxMonthlyTokens: 300000,
    // Feature flags - most enabled except deep insights and deep memory
    enableRealtime: true,
    enableVoiceTTS: true,
    enableAudioVella: true,
    enableArchitect: true,
    enableDeepDive: true,
    enableDeepInsights: false,
    enableGrowthRoadmap: true,
    enableDeepMemory: false,
    // Rate limiting - moderate
    requestsPerMinute: 30,
};
/**
 * ELITE tier defaults.
 * Maximum token quota with access to all features.
 * Exclusive deep insights and deep memory features.
 */
exports.DEFAULT_ELITE_ENTITLEMENTS = {
    // Token economy limit - 1M tokens per month (100x free tier)
    maxMonthlyTokens: 1000000,
    // Feature flags - all enabled including deep memory
    enableRealtime: true,
    enableVoiceTTS: true,
    enableAudioVella: true,
    enableArchitect: true,
    enableDeepDive: true,
    enableDeepInsights: true,
    enableGrowthRoadmap: true,
    enableDeepMemory: true,
    // Rate limiting - generous
    requestsPerMinute: 60,
};
/**
 * All default entitlements keyed by tier.
 * Useful for admin UI or bulk operations.
 */
exports.DEFAULT_ENTITLEMENTS_BY_TIER = {
    free: exports.DEFAULT_FREE_ENTITLEMENTS,
    pro: exports.DEFAULT_PRO_ENTITLEMENTS,
    elite: exports.DEFAULT_ELITE_ENTITLEMENTS,
};
/**
 * Get default entitlements for a specific plan tier.
 *
 * HARDENING CHANGE: This function now throws for unknown tiers.
 * Use getDefaultEntitlementsSafe() for the old fallback behavior.
 * Use getRestrictedEntitlements() for fail-closed behavior.
 *
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
function getDefaultEntitlements(plan) {
    switch (plan) {
        case "free":
            return { ...exports.DEFAULT_FREE_ENTITLEMENTS };
        case "pro":
            return { ...exports.DEFAULT_PRO_ENTITLEMENTS };
        case "elite":
            return { ...exports.DEFAULT_ELITE_ENTITLEMENTS };
        default:
            // HARDENING: No silent fallback. Throw explicit error.
            throw new types_1.UnknownTierError(String(plan), "getDefaultEntitlements");
    }
}
/**
 * Safe version that returns a result type instead of throwing.
 * Use this when you need to handle unknown tiers gracefully.
 */
function getDefaultEntitlementsSafe(plan) {
    if (!(0, types_1.isValidPlanTier)(plan)) {
        return {
            success: false,
            error: new types_1.UnknownTierError(plan, "getDefaultEntitlementsSafe"),
        };
    }
    return {
        success: true,
        plan,
        entitlements: getDefaultEntitlements(plan),
        source: "defaults",
    };
}
/**
 * Get restricted entitlements for unknown/invalid tiers.
 * This is a fail-closed policy - use in enforcement paths.
 * Logs warning so operators know something is wrong.
 */
function getRestrictedEntitlements(tier) {
    console.warn(`[ENTITLEMENTS] Unknown tier "${tier}" - using RESTRICTED entitlements. ` +
        `This indicates a data issue that should be investigated.` +
        `Restricted: 1k tokens, no premium features.`);
    return { ...exports.RESTRICTED_ENTITLEMENTS };
}
/**
 * Get just the token limit for a tier.
 *
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
function getTierTokenLimit(plan) {
    return getDefaultEntitlements(plan).maxMonthlyTokens;
}
/**
 * Safe version that returns null for unknown tiers.
 */
function getTierTokenLimitSafe(plan) {
    if (!(0, types_1.isValidPlanTier)(plan)) {
        return null;
    }
    return getTierTokenLimit(plan);
}
/**
 * Get all feature flags for a tier.
 * Returns the full entitlement object.
 *
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
function getTierFeatures(plan) {
    const { maxMonthlyTokens, requestsPerMinute, ...features } = getDefaultEntitlements(plan);
    return features;
}
/**
 * Check if a specific feature is enabled for a tier (based on defaults).
 * For checking a specific user's entitlements, use the user's actual entitlement object.
 *
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
function isFeatureEnabledByDefault(plan, feature) {
    const entitlements = getDefaultEntitlements(plan);
    return entitlements[feature] === true;
}
/**
 * Safe version that returns false for unknown tiers.
 */
function isFeatureEnabledByDefaultSafe(plan, feature) {
    if (!(0, types_1.isValidPlanTier)(plan)) {
        return false;
    }
    return isFeatureEnabledByDefault(plan, feature);
}
