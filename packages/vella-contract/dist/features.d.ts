/**
 * Vella Contract - Feature Registry
 * Single source of truth for all features in the system.
 *
 * This file defines ALL features with:
 * - featureKey: Canonical identifier
 * - entitlementFlag: The entitlement field that gates this feature (if gated)
 * - uiSoftGate: Whether UI should show upgrade modal when blocked
 * - description: Human-readable feature name
 *
 * CRITICAL: All feature gating MUST use this registry. No hardcoded tier checks allowed.
 */
import type { PlanEntitlement } from "./types";
/**
 * Canonical feature keys.
 * These are the ONLY valid feature identifiers in the system.
 */
export type FeatureKey = "chat_text" | "realtime_session" | "realtime_offer" | "voice_tts" | "audio_vella" | "transcribe" | "insights_generate" | "insights_patterns" | "deepdive" | "architect" | "reflection" | "strategy" | "compass" | "emotion_intel" | "growth_roadmap" | "clarity" | "deep_insights";
/**
 * All valid feature keys as an array for runtime validation.
 */
export declare const ALL_FEATURE_KEYS: FeatureKey[];
/**
 * Token billing channels.
 */
export type TokenChannel = "text" | "realtime" | "audio";
/**
 * Complete feature definition.
 */
export interface FeatureDefinition {
    /** Canonical feature key - must exist in FeatureKey union type */
    featureKey: FeatureKey;
    /**
     * The entitlement boolean field that gates this feature.
     * If undefined, feature is available to all tiers (token-gated only).
     */
    entitlementFlag?: keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute">;
    /** Token channel for billing/quota purposes */
    tokenChannel: TokenChannel;
    /** Whether UI should soft-gate (show upgrade modal) when feature not available */
    uiSoftGate: boolean;
    /** Human-readable feature name for UI */
    displayName: string;
    /** Brief description for UI/tooltips */
    description: string;
    /** Whether this feature is admin-configurable */
    adminConfigurable: boolean;
}
/**
 * ALL features in the system.
 *
 * NOTE: This is the ONLY place where feature-to-entitlement mapping should exist.
 * Any code checking feature availability should reference this registry.
 *
 * Vella-Control admin panel renders toggles from this registry.
 * MOBILE runtime checks feature access through this registry.
 */
export declare const FEATURE_REGISTRY: Record<FeatureKey, FeatureDefinition>;
/**
 * Deep Memory features - these are gated by enableDeepMemory entitlement.
 * They don't consume tokens directly but require the Deep Memory feature flag.
 */
export declare const DEEP_MEMORY_FEATURES: readonly ["narrative_context", "memory_consolidation", "episodic_clustering"];
export type DeepMemoryFeature = (typeof DEEP_MEMORY_FEATURES)[number];
/**
 * Features that are admin-configurable (can be toggled in admin panel).
 * Generated dynamically from FEATURE_REGISTRY.
 */
export declare function getAdminConfigurableFeatures(): FeatureDefinition[];
/**
 * Get all entitlement flags that are used by features.
 * Useful for admin UI to know which toggles to show.
 */
export declare function getAllEntitlementFlags(): (keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute">)[];
/**
 * Check if a feature requires a specific entitlement.
 * Returns the entitlement flag key, or undefined if feature is always allowed.
 */
export declare function getFeatureEntitlement(feature: FeatureKey): keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute"> | undefined;
/**
 * Check if a feature should be soft-gated in the UI.
 * When true, UI shows upgrade modal instead of hard error.
 */
export declare function isFeatureUISoftGated(feature: FeatureKey): boolean;
/**
 * Get display name for a feature.
 */
export declare function getFeatureDisplayName(feature: FeatureKey): string;
/**
 * Check if a feature is available given entitlements.
 * This is the PURE abstraction - no tier strings, only entitlement flags.
 *
 * @param feature - The feature to check
 * @param entitlements - The user's entitlements
 * @returns true if feature is available
 */
export declare function isFeatureEnabled(feature: FeatureKey, entitlements: PlanEntitlement): boolean;
/**
 * Check if Deep Memory is enabled for the user.
 * Deep Memory is a composite feature that enables:
 * - Narrative memory context
 * - Memory consolidation
 * - Episodic clustering
 */
export declare function isDeepMemoryEnabled(entitlements: PlanEntitlement): boolean;
/**
 * Get all feature keys that require a specific entitlement.
 * Useful for admin UI or debugging.
 */
export declare function getFeaturesByEntitlement(entitlementFlag: keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute">): FeatureKey[];
/**
 * Validate that all FeatureKey values exist in the registry.
 * Call this at startup to catch drift.
 */
export declare function validateFeatureRegistry(): {
    valid: boolean;
    missing: FeatureKey[];
    duplicates: FeatureKey[];
};
//# sourceMappingURL=features.d.ts.map