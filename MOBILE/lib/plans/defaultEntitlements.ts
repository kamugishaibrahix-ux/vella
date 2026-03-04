/**
 * Default Plan Entitlements
 * Safe fallback values used when admin config is unavailable or invalid.
 * These are production-safe defaults that ensure the system works
 * even when admin configuration fails.
 * 
 * HARDENING: Unknown tiers fail-closed with RESTRICTED_ENTITLEMENTS, not free.
 */

import type { PlanEntitlement, PlanTier } from "./types";

/**
 * RESTRICTED entitlements for unknown/invalid tiers.
 * FAIL-CLOSED POLICY: Used when tier cannot be determined.
 * Has minimal tokens (1k), no premium features - safe but limited.
 * This prevents showing inflated limits when API fails or tier is unknown.
 */
export const RESTRICTED_ENTITLEMENTS: PlanEntitlement = {
  maxMonthlyTokens: 1_000,
  isPaid: false,
  usesAllocationBucket: false,
  enableRealtime: false,
  enableVoiceTTS: false,
  enableAudioVella: false,
  enableArchitect: false,
  enableDeepDive: false,
  enableDeepInsights: false,
  enableGrowthRoadmap: false,
  enableDeepMemory: false,
  requestsPerMinute: 1,
};

/**
 * FREE tier defaults.
 * Core access to basic chat with limited tokens.
 * No premium AI features.
 */
export const DEFAULT_FREE_ENTITLEMENTS: PlanEntitlement = {
  maxMonthlyTokens: 10_000,
  isPaid: false,
  usesAllocationBucket: false,
  enableRealtime: false,
  enableVoiceTTS: false,
  enableAudioVella: false,
  enableArchitect: false,
  enableDeepDive: false,
  enableDeepInsights: false,
  enableGrowthRoadmap: false,
  enableDeepMemory: false,
  requestsPerMinute: 5,
};

/**
 * PRO tier defaults.
 * Full access to most AI features with generous token quota.
 * Excludes elite-only deep insights.
 */
export const DEFAULT_PRO_ENTITLEMENTS: PlanEntitlement = {
  maxMonthlyTokens: 300_000,
  isPaid: true,
  usesAllocationBucket: true,
  enableRealtime: true,
  enableVoiceTTS: true,
  enableAudioVella: true,
  enableArchitect: true,
  enableDeepDive: true,
  enableDeepInsights: false,
  enableGrowthRoadmap: true,
  enableDeepMemory: false,
  requestsPerMinute: 30,
};

/**
 * ELITE tier defaults.
 * Maximum token quota with access to all features.
 * Exclusive deep insights feature.
 */
export const DEFAULT_ELITE_ENTITLEMENTS: PlanEntitlement = {
  maxMonthlyTokens: 1_000_000,
  isPaid: true,
  usesAllocationBucket: true,
  enableRealtime: true,
  enableVoiceTTS: true,
  enableAudioVella: true,
  enableArchitect: true,
  enableDeepDive: true,
  enableDeepInsights: true,
  enableGrowthRoadmap: true,
  enableDeepMemory: true,
  requestsPerMinute: 60,
};

/**
 * Unknown tier error for strict mode.
 * Thrown when an invalid tier is encountered in logic paths.
 */
export class UnknownTierError extends Error {
  readonly tier: string;
  readonly context: string;

  constructor(tier: string, context: string) {
    super(`Unknown tier "${tier}" encountered in ${context}`);
    this.name = "UnknownTierError";
    this.tier = tier;
    this.context = context;
  }
}

/**
 * Check if a string is a valid PlanTier.
 */
export function isValidPlanTier(tier: string): tier is PlanTier {
  return tier === "free" || tier === "pro" || tier === "elite";
}

/**
 * Get default entitlements for a specific plan tier.
 * 
 * HARDENING: Throws UnknownTierError for unknown tiers.
 * Previously: Silently fell back to free
 * Now: Explicit error to catch data issues
 * 
 * @throws {UnknownTierError} If tier is not free/pro/elite
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
      // HARDENING: Throw explicit error instead of silent fallback
      throw new UnknownTierError(String(plan), "getDefaultEntitlements");
  }
}

/**
 * Safe version that returns null for unknown tiers instead of throwing.
 * Use this when you need to handle unknown tiers gracefully.
 */
export function getDefaultEntitlementsSafe(plan: string): PlanEntitlement | null {
  if (!isValidPlanTier(plan)) {
    return null;
  }
  return getDefaultEntitlements(plan);
}

/**
 * All default entitlements keyed by tier.
 * Useful for admin UI or bulk operations.
 */
export const DEFAULT_ENTITLEMENTS_BY_TIER = {
  free: DEFAULT_FREE_ENTITLEMENTS,
  pro: DEFAULT_PRO_ENTITLEMENTS,
  elite: DEFAULT_ELITE_ENTITLEMENTS,
} as const;
