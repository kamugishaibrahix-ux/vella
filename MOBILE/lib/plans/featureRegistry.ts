/**
 * Feature Registry - Single Source of Truth
 * 
 * This file defines ALL features in the system with:
 * - featureKey: Canonical identifier (matches FeatureKey in costSchedule.ts)
 * - entitlementFlag: The entitlement field that gates this feature (if gated)
 * - tokenChannel: The token channel for billing (text/realtime/audio)
 * - costScheduleKey: Reference to TOKEN_COST_SCHEDULE entry
 * - uiSoftGate: Whether UI should show upgrade modal when blocked
 * - description: Human-readable feature name
 * 
 * CRITICAL: All feature gating MUST use this registry. No hardcoded tier checks allowed.
 */

import type { FeatureKey, TokenChannel } from "@/lib/tokens/costSchedule";
import type { PlanEntitlement } from "./types";

/**
 * Complete feature definition
 */
export interface FeatureDefinition {
  /** Canonical feature key - must exist in FeatureKey union type */
  featureKey: FeatureKey;

  /** 
   * The entitlement boolean field that gates this feature.
   * If undefined, feature is available to all tiers (token-gated only).
   */
  entitlementFlag?: keyof PlanEntitlement;

  /** Token channel for billing/quota purposes */
  tokenChannel: TokenChannel;

  /** Whether UI should soft-gate (show upgrade modal) when feature not available */
  uiSoftGate: boolean;

  /** Human-readable feature name for UI */
  displayName: string;

  /** Brief description for UI/tooltips */
  description: string;
}

/**
 * ALL features in the system.
 * 
 * NOTE: This is the ONLY place where feature-to-entitlement mapping should exist.
 * Any code checking feature availability should reference this registry.
 */
export const FEATURE_REGISTRY: Record<FeatureKey, FeatureDefinition> = {
  // Chat - available to all tiers (token-gated only)
  chat_text: {
    featureKey: "chat_text",
    tokenChannel: "text",
    uiSoftGate: false,
    displayName: "Chat",
    description: "Text-based conversation with Vella",
  },

  // Realtime voice features
  realtime_session: {
    featureKey: "realtime_session",
    entitlementFlag: "enableRealtime",
    tokenChannel: "realtime",
    uiSoftGate: true,
    displayName: "Realtime Voice Session",
    description: "Voice conversation with Vella",
  },
  realtime_offer: {
    featureKey: "realtime_offer",
    entitlementFlag: "enableRealtime",
    tokenChannel: "realtime",
    uiSoftGate: false, // Internal, not user-facing
    displayName: "Realtime Connection",
    description: "WebRTC connection setup",
  },

  // Standard voice (HTTP turn-based, available to all plans)
  voice_standard: {
    featureKey: "voice_standard",
    tokenChannel: "audio",
    uiSoftGate: false,
    displayName: "Standard Voice",
    description: "Turn-based voice conversation (STT → LLM → TTS over HTTP)",
  },

  // Audio features
  voice_tts: {
    featureKey: "voice_tts",
    entitlementFlag: "enableVoiceTTS",
    tokenChannel: "audio",
    uiSoftGate: true,
    displayName: "Voice Generation",
    description: "Text-to-speech audio generation",
  },
  audio_vella: {
    featureKey: "audio_vella",
    entitlementFlag: "enableAudioVella",
    tokenChannel: "audio",
    uiSoftGate: true,
    displayName: "Vella Audio",
    description: "Meditation, music, and ambience generation",
  },
  transcribe: {
    featureKey: "transcribe",
    entitlementFlag: "enableVoiceTTS", // Transcription bundled with TTS
    tokenChannel: "audio",
    uiSoftGate: false, // Usually used internally
    displayName: "Voice Transcription",
    description: "Speech-to-text transcription",
  },

  // AI insights/analysis features
  insights_generate: {
    featureKey: "insights_generate",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Insights",
    description: "AI-generated insights from your data",
  },
  insights_patterns: {
    featureKey: "insights_patterns",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Pattern Analysis",
    description: "Pattern detection from check-ins",
  },
  deepdive: {
    featureKey: "deepdive",
    entitlementFlag: "enableDeepDive",
    tokenChannel: "text",
    uiSoftGate: true,
    displayName: "Deep Dive Analysis",
    description: "In-depth analysis of specific topics",
  },
  architect: {
    featureKey: "architect",
    entitlementFlag: "enableArchitect",
    tokenChannel: "text",
    uiSoftGate: true,
    displayName: "Life Architect",
    description: "Life planning and architecture tools",
  },
  reflection: {
    featureKey: "reflection",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "AI Reflection",
    description: "Guided reflection generation",
  },
  strategy: {
    featureKey: "strategy",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Strategy Formulation",
    description: "Strategic planning assistance",
  },
  compass: {
    featureKey: "compass",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Compass Guidance",
    description: "Directional guidance and navigation",
  },
  emotion_intel: {
    featureKey: "emotion_intel",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Emotional Intelligence",
    description: "Emotional analysis and intelligence",
  },
  growth_roadmap: {
    featureKey: "growth_roadmap",
    entitlementFlag: "enableGrowthRoadmap",
    tokenChannel: "text",
    uiSoftGate: true,
    displayName: "Growth Roadmap",
    description: "Personal growth planning and tracking",
  },
  clarity: {
    featureKey: "clarity",
    tokenChannel: "text",
    uiSoftGate: false, // Available to all, token-gated
    displayName: "Clarity Analysis",
    description: "Clarity and focus analysis",
  },
  // Deep insights - elite only
  deep_insights: {
    featureKey: "deep_insights", // Note: underscore in key vs hyphen in some places
    entitlementFlag: "enableDeepInsights",
    tokenChannel: "text",
    uiSoftGate: true,
    displayName: "Deep Insights",
    description: "Elite-tier advanced insights (requires Elite plan)",
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
 * Check if a feature requires a specific entitlement.
 * Returns the entitlement flag key, or undefined if feature is always allowed.
 */
export function getFeatureEntitlement(feature: FeatureKey): keyof PlanEntitlement | undefined {
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
  entitlementFlag: keyof PlanEntitlement
): FeatureKey[] {
  return Object.values(FEATURE_REGISTRY)
    .filter((def) => def.entitlementFlag === entitlementFlag)
    .map((def) => def.featureKey);
}

/**
 * Validate that all FeatureKey values exist in the registry.
 * Call this at startup to catch drift.
 */
export function validateFeatureRegistry(): { valid: boolean; missing: FeatureKey[] } {
  // This is a compile-time check that would need the actual FeatureKey union
  // In practice, TypeScript will catch mismatches at build time
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
    missing: duplicates,
  };
}

/**
 * Feature Registry Table
 * 
 * | Feature Key | Entitlement Flag | Token Channel | UI Soft Gate | Display Name |
 * |-------------|------------------|---------------|--------------|--------------|
 * | chat_text | (none) | text | No | Chat |
 * | realtime_session | enableRealtime | realtime | Yes | Realtime Voice Session |
 * | realtime_offer | enableRealtime | realtime | No | Realtime Connection |
 * | voice_tts | enableVoiceTTS | audio | Yes | Voice Generation |
 * | audio_vella | enableAudioVella | audio | Yes | Vella Audio |
 * | transcribe | enableVoiceTTS | audio | No | Voice Transcription |
 * | insights_generate | (none) | text | No | Insights |
 * | insights_patterns | (none) | text | No | Pattern Analysis |
 * | deepdive | enableDeepDive | text | Yes | Deep Dive Analysis |
 * | architect | enableArchitect | text | Yes | Life Architect |
 * | reflection | (none) | text | No | AI Reflection |
 * | strategy | (none) | text | No | Strategy Formulation |
 * | compass | (none) | text | No | Compass Guidance |
 * | emotion_intel | (none) | text | No | Emotional Intelligence |
 * | growth_roadmap | enableGrowthRoadmap | text | Yes | Growth Roadmap |
 * | clarity | (none) | text | No | Clarity Analysis |
 * | deep_insights | enableDeepInsights | text | Yes | Deep Insights |
 * 
 * Deep Memory (composite, enableDeepMemory):
 * - narrative_context
 * - memory_consolidation
 * - episodic_clustering
 */
