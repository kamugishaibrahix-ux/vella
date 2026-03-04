/**
 * Plan Entitlement Types
 * Canonical definition of what each plan tier can access.
 * Used by admin-backed entitlement resolver.
 */

export type PlanTier = "free" | "pro" | "elite";

/**
 * Entitlements for a single plan tier.
 * Token-economy centric: only token limits and feature flags.
 * All fields are required - no optional fields to ensure complete definition.
 */
export interface PlanEntitlement {
  // Token economy limit - single unified quota
  maxMonthlyTokens: number;

  // Structural booleans — replace numeric permission comparisons
  isPaid: boolean;
  usesAllocationBucket: boolean;

  // Feature flags - boolean gates (access control, not volume control)
  enableRealtime: boolean;
  enableVoiceTTS: boolean;
  enableAudioVella: boolean;
  enableArchitect: boolean;
  enableDeepDive: boolean;
  enableDeepInsights: boolean;
  enableGrowthRoadmap: boolean;

  /**
   * Deep Memory: Elite-only structured narrative + clustering layer.
   * When true: Enables narrative memory, consolidation, episodic clustering.
   * When false: Retrieval falls back to standard tier-limited chunks only.
   */
  enableDeepMemory: boolean;

  // Rate limiting (optional - can be undefined to use system default)
  requestsPerMinute?: number;
}

/**
 * Entitlements for all three tiers.
 * Nested in admin_ai_config for admin control.
 */
export interface PlanEntitlementsConfig {
  free: PlanEntitlement;
  pro: PlanEntitlement;
  elite: PlanEntitlement;
}

/**
 * Result from resolvePlanEntitlements.
 * Always returns the plan tier and fully populated entitlements.
 */
export interface ResolvedPlanEntitlements {
  plan: PlanTier;
  entitlements: PlanEntitlement;
  source: "admin" | "defaults";
}
