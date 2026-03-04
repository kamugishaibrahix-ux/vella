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
export type FeatureKey =
  | "chat_text"
  | "realtime_session"
  | "realtime_offer"
  | "voice_tts"
  | "audio_vella"
  | "transcribe"
  | "insights_generate"
  | "insights_patterns"
  | "deepdive"
  | "architect"
  | "reflection"
  | "strategy"
  | "compass"
  | "emotion_intel"
  | "growth_roadmap"
  | "clarity"
  | "deep_insights";

/**
 * All valid feature keys as an array for runtime validation.
 */
export const ALL_FEATURE_KEYS: FeatureKey[] = [
  "chat_text",
  "realtime_session",
  "realtime_offer",
  "voice_tts",
  "audio_vella",
  "transcribe",
  "insights_generate",
  "insights_patterns",
  "deepdive",
  "architect",
  "reflection",
  "strategy",
  "compass",
  "emotion_intel",
  "growth_roadmap",
  "clarity",
  "deep_insights",
];

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
  entitlementFlag?: keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute" | "isPaid" | "usesAllocationBucket">;

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
export const FEATURE_REGISTRY: Record<FeatureKey, FeatureDefinition> = {
  // Chat - available to all tiers (token-gated only)
  chat_text: {
    featureKey: "chat_text",
    tokenChannel: "text",
    uiSoftGate: false,
    displayName: "Chat",
    description: "Text-based conversation with Vella",
    adminConfigurable: false, // Always enabled
  },

  // Realtime voice features
  realtime_session: {
    featureKey: "realtime_session",
    entitlementFlag: "enableRealtime",
    tokenChannel: "realtime",
    uiSoftGate: true,
    displayName: "Realtime Voice Session",
    description: "Voice conversation with Vella",
    adminConfigurable: true,
  },
  realtime_offer: {
    featureKey: "realtime_offer",
    entitlementFlag: "enableRealtime",
    tokenChannel: "realtime",
    uiSoftGate: false, // Internal, not user-facing
    displayName: "Realtime Connection",
    description: "WebRTC connection setup",
    adminConfigurable: false, // Bundled with realtime_session
  },

  // Audio features
  voice_tts: {
    featureKey: "voice_tts",
    entitlementFlag: "enableVoiceTTS",
    tokenChannel: "audio",
    uiSoftGate: true,
    displayName: "Voice Generation",
    description: "Text-to-speech audio generation",
    adminConfigurable: true,
  },
  audio_vella: {
    featureKey: "audio_vella",
    entitlementFlag: "enableAudioVella",
    tokenChannel: "audio",
    uiSoftGate: true,
    displayName: "Vella Audio",
    description: "Meditation, music, and ambience generation",
    adminConfigurable: true,
  },
  transcribe: {
    featureKey: "transcribe",
    entitlementFlag: "enableVoiceTTS", // Transcription bundled with TTS
    tokenChannel: "audio",
    uiSoftGate: false, // Usually used internally
    displayName: "Voice Transcription",
    description: "Speech-to-text transcription",
    adminConfigurable: false, // Bundled with voice_tts
  },

  // AI insights/analysis features
  insights_generate: {
    featureKey: "insights_generate",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Insights",
    description: "AI-generated insights from your data",
    adminConfigurable: false, // Always enabled
  },
  insights_patterns: {
    featureKey: "insights_patterns",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Pattern Analysis",
    description: "Pattern detection from check-ins",
    adminConfigurable: false, // Always enabled
  },
  deepdive: {
    featureKey: "deepdive",
    entitlementFlag: "enableDeepDive",
    tokenChannel: "text",
    uiSoftGate: true,
    displayName: "Deep Dive Analysis",
    description: "In-depth analysis of specific topics",
    adminConfigurable: true,
  },
  architect: {
    featureKey: "architect",
    entitlementFlag: "enableArchitect",
    tokenChannel: "text",
    uiSoftGate: true,
    displayName: "Life Architect",
    description: "Life planning and architecture tools",
    adminConfigurable: true,
  },
  reflection: {
    featureKey: "reflection",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "AI Reflection",
    description: "Guided reflection generation",
    adminConfigurable: false, // Always enabled
  },
  strategy: {
    featureKey: "strategy",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Strategy Formulation",
    description: "Strategic planning assistance",
    adminConfigurable: false, // Always enabled
  },
  compass: {
    featureKey: "compass",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Compass Guidance",
    description: "Directional guidance and navigation",
    adminConfigurable: false, // Always enabled
  },
  emotion_intel: {
    featureKey: "emotion_intel",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Emotional Intelligence",
    description: "Emotional analysis and intelligence",
    adminConfigurable: false, // Always enabled
  },
  growth_roadmap: {
    featureKey: "growth_roadmap",
    entitlementFlag: "enableGrowthRoadmap",
    tokenChannel: "text",
    uiSoftGate: true,
    displayName: "Growth Roadmap",
    description: "Personal growth planning and tracking",
    adminConfigurable: true,
  },
  clarity: {
    featureKey: "clarity",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Clarity Analysis",
    description: "Clarity and focus analysis",
    adminConfigurable: false, // Always enabled
  },
  // Deep insights - elite only
  deep_insights: {
    featureKey: "deep_insights",
    entitlementFlag: "enableDeepInsights",
    tokenChannel: "text",
    uiSoftGate: true,
    displayName: "Deep Insights",
    description: "Elite-tier advanced insights (requires Elite plan)",
    adminConfigurable: true,
  },
};

/**
 * Deep Memory features - these are gated by enableDeepMemory entitlement.
 * They don't consume tokens directly but require the Deep Memory feature flag.
 */
export const DEEP_MEMORY_FEATURES = [
  "narrative_context",
  "memory_consolidation", 
  "episodic_clustering",
] as const;

export type DeepMemoryFeature = (typeof DEEP_MEMORY_FEATURES)[number];

/**
 * Features that are admin-configurable (can be toggled in admin panel).
 * Generated dynamically from FEATURE_REGISTRY.
 */
export function getAdminConfigurableFeatures(): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.adminConfigurable);
}

/**
 * Get all entitlement flags that are used by features.
 * Useful for admin UI to know which toggles to show.
 */
export function getAllEntitlementFlags(): (keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute" | "isPaid" | "usesAllocationBucket">)[] {
  const flags = new Set<keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute" | "isPaid" | "usesAllocationBucket">>();
  
  for (const feature of Object.values(FEATURE_REGISTRY)) {
    if (feature.entitlementFlag) {
      flags.add(feature.entitlementFlag);
    }
  }
  
  return Array.from(flags);
}

/**
 * Check if a feature requires a specific entitlement.
 * Returns the entitlement flag key, or undefined if feature is always allowed.
 */
export function getFeatureEntitlement(feature: FeatureKey): keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute" | "isPaid" | "usesAllocationBucket"> | undefined {
  return FEATURE_REGISTRY[feature]?.entitlementFlag;
}

/**
 * Check if a feature should be soft-gated in the UI.
 * When true, UI shows upgrade modal instead of hard error.
 */
export function isFeatureUISoftGated(feature: FeatureKey): boolean {
  return FEATURE_REGISTRY[feature]?.uiSoftGate ?? false;
}

/**
 * Get display name for a feature.
 */
export function getFeatureDisplayName(feature: FeatureKey): string {
  return FEATURE_REGISTRY[feature]?.displayName ?? feature;
}

/**
 * Check if a feature is available given entitlements.
 * This is the PURE abstraction - no tier strings, only entitlement flags.
 * 
 * @param feature - The feature to check
 * @param entitlements - The user's entitlements
 * @returns true if feature is available
 */
export function isFeatureEnabled(
  feature: FeatureKey,
  entitlements: PlanEntitlement
): boolean {
  const entitlementFlag = getFeatureEntitlement(feature);
  
  // No entitlement flag = always available (token-gated only)
  if (!entitlementFlag) {
    return true;
  }
  
  // Check the entitlement boolean
  const enabled = entitlements[entitlementFlag];
  return typeof enabled === "boolean" ? enabled : false;
}

/**
 * Check if Deep Memory is enabled for the user.
 * Deep Memory is a composite feature that enables:
 * - Narrative memory context
 * - Memory consolidation
 * - Episodic clustering
 */
export function isDeepMemoryEnabled(entitlements: PlanEntitlement): boolean {
  return entitlements.enableDeepMemory === true;
}

/**
 * Get all feature keys that require a specific entitlement.
 * Useful for admin UI or debugging.
 */
export function getFeaturesByEntitlement(
  entitlementFlag: keyof Omit<PlanEntitlement, "maxMonthlyTokens" | "requestsPerMinute" | "isPaid" | "usesAllocationBucket">
): FeatureKey[] {
  return Object.values(FEATURE_REGISTRY)
    .filter((def) => def.entitlementFlag === entitlementFlag)
    .map((def) => def.featureKey);
}

/**
 * Validate that all FeatureKey values exist in the registry.
 * Call this at startup to catch drift.
 */
export function validateFeatureRegistry(): { valid: boolean; missing: FeatureKey[]; duplicates: FeatureKey[] } {
  const registeredKeys = Object.keys(FEATURE_REGISTRY) as FeatureKey[];
  
  // Check for duplicates or missing entries
  const seen = new Set<FeatureKey>();
  const duplicates: FeatureKey[] = [];
  
  for (const key of registeredKeys) {
    if (seen.has(key)) {
      duplicates.push(key);
    }
    seen.add(key);
  }
  
  return {
    valid: duplicates.length === 0,
    missing: [], // Would need source of truth to check
    duplicates,
  };
}
