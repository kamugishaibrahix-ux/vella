"use strict";
/**
 * Vella Contract - Core Types
 * Single source of truth for plan tiers and entitlements.
 *
 * IMPORTANT: This is the ONLY place where PlanTier and PlanEntitlement are defined.
 * Both MOBILE and Vella-Control MUST import from this package.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnknownTierError = exports.VALID_PLAN_TIERS = void 0;
exports.isValidPlanTier = isValidPlanTier;
exports.validatePlanTier = validatePlanTier;
exports.assertValidPlanTier = assertValidPlanTier;
exports.normalizeToPlanTier = normalizeToPlanTier;
/**
 * All valid plan tier values as an array for runtime validation.
 */
exports.VALID_PLAN_TIERS = ["free", "pro", "elite"];
/**
 * Error thrown when an unknown tier is encountered in logic paths.
 * Unknown tiers must be explicitly handled - never silently fall back to free.
 */
class UnknownTierError extends Error {
    constructor(tier, context) {
        super(`Unknown tier "${tier}" encountered in ${context}. Unknown tiers must be explicitly handled.`);
        this.name = "UnknownTierError";
        this.tier = tier;
        this.context = context;
    }
}
exports.UnknownTierError = UnknownTierError;
/**
 * Check if a string is a valid PlanTier.
 * Use this for runtime validation of plan names.
 */
function isValidPlanTier(tier) {
    return exports.VALID_PLAN_TIERS.includes(tier);
}
/**
 * Validate a tier string and return an explicit result.
 * Use this when you need to handle unknown tiers explicitly.
 */
function validatePlanTier(tier, context) {
    if (isValidPlanTier(tier)) {
        return { success: true, tier };
    }
    return { success: false, error: new UnknownTierError(tier, context) };
}
/**
 * Assert that a tier is valid, throwing if it's not.
 * Use this in logic paths where unknown tiers indicate a bug or data corruption.
 */
function assertValidPlanTier(tier, context) {
    if (!isValidPlanTier(tier)) {
        throw new UnknownTierError(tier, context);
    }
}
/**
 * Normalize a plan name to a canonical PlanTier.
 * Handles legacy aliases (basic -> free, premium -> elite).
 * Returns null for unknown tiers (caller must handle explicitly).
 */
function normalizeToPlanTier(plan) {
    if (!plan)
        return "free";
    const normalized = plan.toLowerCase().trim();
    // Handle legacy aliases
    if (normalized === "basic")
        return "free";
    if (normalized === "premium")
        return "elite";
    // Validate against known tiers
    if (isValidPlanTier(normalized)) {
        return normalized;
    }
    // Unknown tier - return null (caller must handle explicitly)
    return null;
}
