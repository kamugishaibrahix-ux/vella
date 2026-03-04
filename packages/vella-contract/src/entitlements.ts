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

import type { PlanEntitlement, PlanTier, PlanEntitlementsConfig, EntitlementResolutionResult, UnknownTierError } from "./types";
import { UnknownTierError as UnknownTierErrorClass, isValidPlanTier } from "./types";

/**
 * Restricted entitlements for unknown/invalid tiers.
 * This is a fail-closed policy - no premium features, minimal tokens.
 * Used when we can't determine the tier but need to provide some entitlements.
 */
export const RESTRICTED_ENTITLEMENTS: PlanEntitlement = {
  // Minimal token allocation
  maxMonthlyTokens: 1_000,

  // Structural booleans
  isPaid: false,
  usesAllocationBucket: false,

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
export const DEFAULT_FREE_ENTITLEMENTS: PlanEntitlement = {
  // Token economy limit - 10k tokens per month
  maxMonthlyTokens: 10_000,

  // Structural booleans
  isPaid: false,
  usesAllocationBucket: false,

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
export const DEFAULT_PRO_ENTITLEMENTS: PlanEntitlement = {
  // Token economy limit - 300k tokens per month (30x free tier)
  maxMonthlyTokens: 300_000,

  // Structural booleans
  isPaid: true,
  usesAllocationBucket: true,

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
export const DEFAULT_ELITE_ENTITLEMENTS: PlanEntitlement = {
  // Token economy limit - 1M tokens per month (100x free tier)
  maxMonthlyTokens: 1_000_000,

  // Structural booleans
  isPaid: true,
  usesAllocationBucket: true,

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
export const DEFAULT_ENTITLEMENTS_BY_TIER: PlanEntitlementsConfig = {
  free: DEFAULT_FREE_ENTITLEMENTS,
  pro: DEFAULT_PRO_ENTITLEMENTS,
  elite: DEFAULT_ELITE_ENTITLEMENTS,
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
export function getDefaultEntitlements(plan: PlanTier): PlanEntitlement {
  switch (plan) {
    case "free":
      return { ...DEFAULT_FREE_ENTITLEMENTS };
    case "pro":
      return { ...DEFAULT_PRO_ENTITLEMENTS };
    case "elite":
      return { ...DEFAULT_ELITE_ENTITLEMENTS };
    default:
      // HARDENING: No silent fallback. Throw explicit error.
      throw new UnknownTierErrorClass(
        String(plan),
        "getDefaultEntitlements"
      );
  }
}

/**
 * Safe version that returns a result type instead of throwing.
 * Use this when you need to handle unknown tiers gracefully.
 */
export function getDefaultEntitlementsSafe(
  plan: string
): EntitlementResolutionResult {
  if (!isValidPlanTier(plan)) {
    return {
      success: false,
      error: new UnknownTierErrorClass(plan, "getDefaultEntitlementsSafe"),
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
export function getRestrictedEntitlements(tier: string): PlanEntitlement {
  console.warn(
    `[ENTITLEMENTS] Unknown tier "${tier}" - using RESTRICTED entitlements. ` +
    `This indicates a data issue that should be investigated.` +
    `Restricted: 1k tokens, no premium features.`
  );
  return { ...RESTRICTED_ENTITLEMENTS };
}

/**
 * Get just the token limit for a tier.
 * 
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
export function getTierTokenLimit(plan: PlanTier): number {
  return getDefaultEntitlements(plan).maxMonthlyTokens;
}

/**
 * Safe version that returns null for unknown tiers.
 */
export function getTierTokenLimitSafe(plan: string): number | null {
  if (!isValidPlanTier(plan)) {
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
export function getTierFeatures(plan: PlanTier): Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute" | "isPaid" | "usesAllocationBucket"> {
  const { maxMonthlyTokens, requestsPerMinute, isPaid, usesAllocationBucket, ...features } = getDefaultEntitlements(plan);
  return features;
}

/**
 * Check if a specific feature is enabled for a tier (based on defaults).
 * For checking a specific user's entitlements, use the user's actual entitlement object.
 * 
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
export function isFeatureEnabledByDefault(
  plan: PlanTier,
  feature: keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute" | "isPaid" | "usesAllocationBucket">
): boolean {
  const entitlements = getDefaultEntitlements(plan);
  return entitlements[feature] === true;
}

/**
 * Safe version that returns false for unknown tiers.
 */
export function isFeatureEnabledByDefaultSafe(
  plan: string,
  feature: keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute" | "isPaid" | "usesAllocationBucket">
): boolean {
  if (!isValidPlanTier(plan)) {
    return false;
  }
  return isFeatureEnabledByDefault(plan, feature);
}
