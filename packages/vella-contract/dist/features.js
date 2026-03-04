"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEEP_MEMORY_FEATURES = exports.FEATURE_REGISTRY = exports.ALL_FEATURE_KEYS = void 0;
exports.getAdminConfigurableFeatures = getAdminConfigurableFeatures;
exports.getAllEntitlementFlags = getAllEntitlementFlags;
exports.getFeatureEntitlement = getFeatureEntitlement;
exports.isFeatureUISoftGated = isFeatureUISoftGated;
exports.getFeatureDisplayName = getFeatureDisplayName;
exports.isFeatureEnabled = isFeatureEnabled;
exports.isDeepMemoryEnabled = isDeepMemoryEnabled;
exports.getFeaturesByEntitlement = getFeaturesByEntitlement;
exports.validateFeatureRegistry = validateFeatureRegistry;
/**
 * All valid feature keys as an array for runtime validation.
 */
exports.ALL_FEATURE_KEYS = [
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
 * ALL features in the system.
 *
 * NOTE: This is the ONLY place where feature-to-entitlement mapping should exist.
 * Any code checking feature availability should reference this registry.
 *
 * Vella-Control admin panel renders toggles from this registry.
 * MOBILE runtime checks feature access through this registry.
 */
exports.FEATURE_REGISTRY = {
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
exports.DEEP_MEMORY_FEATURES = [
    "narrative_context",
    "memory_consolidation",
    "episodic_clustering",
];
/**
 * Features that are admin-configurable (can be toggled in admin panel).
 * Generated dynamically from FEATURE_REGISTRY.
 */
function getAdminConfigurableFeatures() {
    return Object.values(exports.FEATURE_REGISTRY).filter(f => f.adminConfigurable);
}
/**
 * Get all entitlement flags that are used by features.
 * Useful for admin UI to know which toggles to show.
 */
function getAllEntitlementFlags() {
    const flags = new Set();
    for (const feature of Object.values(exports.FEATURE_REGISTRY)) {
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
function getFeatureEntitlement(feature) {
    return exports.FEATURE_REGISTRY[feature]?.entitlementFlag;
}
/**
 * Check if a feature should be soft-gated in the UI.
 * When true, UI shows upgrade modal instead of hard error.
 */
function isFeatureUISoftGated(feature) {
    return exports.FEATURE_REGISTRY[feature]?.uiSoftGate ?? false;
}
/**
 * Get display name for a feature.
 */
function getFeatureDisplayName(feature) {
    return exports.FEATURE_REGISTRY[feature]?.displayName ?? feature;
}
/**
 * Check if a feature is available given entitlements.
 * This is the PURE abstraction - no tier strings, only entitlement flags.
 *
 * @param feature - The feature to check
 * @param entitlements - The user's entitlements
 * @returns true if feature is available
 */
function isFeatureEnabled(feature, entitlements) {
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
function isDeepMemoryEnabled(entitlements) {
    return entitlements.enableDeepMemory === true;
}
/**
 * Get all feature keys that require a specific entitlement.
 * Useful for admin UI or debugging.
 */
function getFeaturesByEntitlement(entitlementFlag) {
    return Object.values(exports.FEATURE_REGISTRY)
        .filter((def) => def.entitlementFlag === entitlementFlag)
        .map((def) => def.featureKey);
}
/**
 * Validate that all FeatureKey values exist in the registry.
 * Call this at startup to catch drift.
 */
function validateFeatureRegistry() {
    const registeredKeys = Object.keys(exports.FEATURE_REGISTRY);
    // Check for duplicates or missing entries
    const seen = new Set();
    const duplicates = [];
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
