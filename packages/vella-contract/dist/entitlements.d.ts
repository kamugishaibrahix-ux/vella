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
import type { PlanEntitlement, PlanTier, PlanEntitlementsConfig, EntitlementResolutionResult } from "./types";
/**
 * Restricted entitlements for unknown/invalid tiers.
 * This is a fail-closed policy - no premium features, minimal tokens.
 * Used when we can't determine the tier but need to provide some entitlements.
 */
export declare const RESTRICTED_ENTITLEMENTS: PlanEntitlement;
/**
 * FREE tier defaults.
 * Core access to basic chat with limited tokens.
 * No premium AI features.
 */
export declare const DEFAULT_FREE_ENTITLEMENTS: PlanEntitlement;
/**
 * PRO tier defaults.
 * Full access to most AI features with generous token quota.
 * Excludes elite-only deep insights and deep memory.
 */
export declare const DEFAULT_PRO_ENTITLEMENTS: PlanEntitlement;
/**
 * ELITE tier defaults.
 * Maximum token quota with access to all features.
 * Exclusive deep insights and deep memory features.
 */
export declare const DEFAULT_ELITE_ENTITLEMENTS: PlanEntitlement;
/**
 * All default entitlements keyed by tier.
 * Useful for admin UI or bulk operations.
 */
export declare const DEFAULT_ENTITLEMENTS_BY_TIER: PlanEntitlementsConfig;
/**
 * Get default entitlements for a specific plan tier.
 *
 * HARDENING CHANGE: This function now throws for unknown tiers.
 * Use getDefaultEntitlementsSafe() for the old fallback behavior.
 * Use getRestrictedEntitlements() for fail-closed behavior.
 *
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
export declare function getDefaultEntitlements(plan: PlanTier): PlanEntitlement;
/**
 * Safe version that returns a result type instead of throwing.
 * Use this when you need to handle unknown tiers gracefully.
 */
export declare function getDefaultEntitlementsSafe(plan: string): EntitlementResolutionResult;
/**
 * Get restricted entitlements for unknown/invalid tiers.
 * This is a fail-closed policy - use in enforcement paths.
 * Logs warning so operators know something is wrong.
 */
export declare function getRestrictedEntitlements(tier: string): PlanEntitlement;
/**
 * Get just the token limit for a tier.
 *
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
export declare function getTierTokenLimit(plan: PlanTier): number;
/**
 * Safe version that returns null for unknown tiers.
 */
export declare function getTierTokenLimitSafe(plan: string): number | null;
/**
 * Get all feature flags for a tier.
 * Returns the full entitlement object.
 *
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
export declare function getTierFeatures(plan: PlanTier): Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute">;
/**
 * Check if a specific feature is enabled for a tier (based on defaults).
 * For checking a specific user's entitlements, use the user's actual entitlement object.
 *
 * @throws {UnknownTierError} If tier is not one of free/pro/elite
 */
export declare function isFeatureEnabledByDefault(plan: PlanTier, feature: keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute">): boolean;
/**
 * Safe version that returns false for unknown tiers.
 */
export declare function isFeatureEnabledByDefaultSafe(plan: string, feature: keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute">): boolean;
//# sourceMappingURL=entitlements.d.ts.map