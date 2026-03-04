/**
 * Vella Contract - Core Types
 * Single source of truth for plan tiers and entitlements.
 *
 * IMPORTANT: This is the ONLY place where PlanTier and PlanEntitlement are defined.
 * Both MOBILE and Vella-Control MUST import from this package.
 */
/**
 * Canonical plan tiers.
 * Currently fixed to 3 tiers. For dynamic tiers, this would become string with runtime validation.
 */
export type PlanTier = "free" | "pro" | "elite";
/**
 * All valid plan tier values as an array for runtime validation.
 */
export declare const VALID_PLAN_TIERS: PlanTier[];
/**
 * Error thrown when an unknown tier is encountered in logic paths.
 * Unknown tiers must be explicitly handled - never silently fall back to free.
 */
export declare class UnknownTierError extends Error {
    readonly tier: string;
    readonly context: string;
    constructor(tier: string, context: string);
}
/**
 * Result type for tier validation.
 * Explicitly models success vs failure to force callers to handle unknown tiers.
 */
export type TierValidationResult = {
    success: true;
    tier: PlanTier;
} | {
    success: false;
    error: UnknownTierError;
};
/**
 * Check if a string is a valid PlanTier.
 * Use this for runtime validation of plan names.
 */
export declare function isValidPlanTier(tier: string): tier is PlanTier;
/**
 * Validate a tier string and return an explicit result.
 * Use this when you need to handle unknown tiers explicitly.
 */
export declare function validatePlanTier(tier: string, context: string): TierValidationResult;
/**
 * Assert that a tier is valid, throwing if it's not.
 * Use this in logic paths where unknown tiers indicate a bug or data corruption.
 */
export declare function assertValidPlanTier(tier: string, context: string): asserts tier is PlanTier;
/**
 * Normalize a plan name to a canonical PlanTier.
 * Handles legacy aliases (basic -> free, premium -> elite).
 * Returns null for unknown tiers (caller must handle explicitly).
 */
export declare function normalizeToPlanTier(plan: string | null | undefined): PlanTier | null;
/**
 * Entitlements for a single plan tier.
 * Token-economy centric: only token limits and feature flags.
 * All fields are required - no optional fields to ensure complete definition.
 *
 * This is the ONLY entitlement schema in the system. Vella-Control must not invent
 * flags that are not defined here.
 */
export interface PlanEntitlement {
    /** Token economy limit - single unified monthly quota (in tokens, not cents) */
    maxMonthlyTokens: number;
    /** Enable realtime voice conversation */
    enableRealtime: boolean;
    /** Enable text-to-speech voice generation */
    enableVoiceTTS: boolean;
    /** Enable Vella audio (meditation, music, ambience) */
    enableAudioVella: boolean;
    /** Enable Life Architect feature */
    enableArchitect: boolean;
    /** Enable Deep Dive analysis */
    enableDeepDive: boolean;
    /** Enable Elite-tier deep insights */
    enableDeepInsights: boolean;
    /** Enable Growth Roadmap planning */
    enableGrowthRoadmap: boolean;
    /**
     * Deep Memory: Elite-only structured narrative + clustering layer.
     * When true: Enables narrative memory, consolidation, episodic clustering.
     * When false: Retrieval falls back to standard tier-limited chunks only.
     */
    enableDeepMemory: boolean;
    /** Rate limiting - max requests per minute (undefined = use system default) */
    requestsPerMinute?: number;
}
/**
 * Entitlements for all tiers.
 * Used by admin configuration and fallback resolution.
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
/**
 * Result type for entitlement resolution that may fail.
 * Use this when tier validation might fail.
 */
export type EntitlementResolutionResult = {
    success: true;
    plan: PlanTier;
    entitlements: PlanEntitlement;
    source: "admin" | "defaults";
} | {
    success: false;
    error: UnknownTierError;
};
/**
 * Admin configuration stored in database.
 * This is the shape of the admin_ai_config table entry.
 */
export interface AdminPlanConfig {
    tier: PlanTier;
    entitlements: PlanEntitlement;
    /** When this config was last updated */
    updatedAt: string;
    /** Who last updated this config */
    updatedBy: string;
}
/**
 * Audit log entry for admin mutations.
 * Every admin write must create one of these.
 */
export interface AdminAuditLog {
    id?: string;
    adminId: string;
    action: string;
    targetUserId?: string;
    previous: Record<string, unknown>;
    next: Record<string, unknown>;
    createdAt: string;
}
/**
 * Policy for handling unknown tiers in different contexts.
 */
export type UnknownTierPolicy = "error" | "restrict" | "allow";
//# sourceMappingURL=types.d.ts.map