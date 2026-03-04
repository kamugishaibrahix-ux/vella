/**
 * Capabilities Layer - Pure Abstraction for Feature Access
 * 
 * This module provides the ONLY way to check feature availability in business logic.
 * NO tier strings ("free", "pro", "elite") are used in logic - only entitlement flags.
 * 
 * RULE: Tier strings may exist ONLY in:
 * - UI labels/badges (display purposes only)
 * - Stripe plan mapping (internal layer)
 * - Analytics tags (non-gating)
 * 
 * Violation of this rule is a architectural regression.
 */

import type { PlanEntitlement } from "./types";
import type { FeatureKey } from "@/lib/tokens/costSchedule";
import { isFeatureEnabled as registryIsEnabled, getFeatureEntitlement } from "./featureRegistry";

/**
 * Capability flags derived from entitlements.
 * This is what components and business logic should use.
 */
export interface Capabilities {
  // Core features
  chat: boolean;
  realtime: boolean;
  voiceTTS: boolean;
  audioVella: boolean;

  // AI analysis features
  insights: boolean;
  patterns: boolean;
  deepDive: boolean;
  architect: boolean;
  reflection: boolean;
  strategy: boolean;
  compass: boolean;
  emotionIntel: boolean;
  growthRoadmap: boolean;
  clarity: boolean;
  deepInsights: boolean;

  // Memory
  deepMemory: boolean;

  // Model/quality (capability-based, not tier-based)
  modelClass: "standard" | "premium";

  // Token economy
  maxMonthlyTokens: number;
  isUnlimited: boolean;
}

/**
 * Derive capabilities from entitlements.
 * This is the ONLY place that maps entitlements to capability flags.
 */
export function getCapabilities(entitlements: PlanEntitlement): Capabilities {
  return {
    // Core features - all can chat, others depend on entitlements
    chat: true,
    realtime: entitlements.enableRealtime,
    voiceTTS: entitlements.enableVoiceTTS,
    audioVella: entitlements.enableAudioVella,

    // AI analysis features
    insights: true, // Available to all, token-gated
    patterns: true, // Available to all, token-gated
    deepDive: entitlements.enableDeepDive,
    architect: entitlements.enableArchitect,
    reflection: true, // Available to all, token-gated
    strategy: true, // Available to all, token-gated
    compass: true, // Available to all, token-gated
    emotionIntel: true, // Available to all, token-gated
    growthRoadmap: entitlements.enableGrowthRoadmap,
    clarity: true, // Available to all, token-gated
    deepInsights: entitlements.enableDeepInsights,

    // Memory
    deepMemory: entitlements.enableDeepMemory,

    // Model class based on deep insights capability (admin-configurable)
    modelClass: entitlements.enableDeepInsights ? "premium" : "standard",

    // Token economy
    maxMonthlyTokens: entitlements.maxMonthlyTokens,
    isUnlimited: entitlements.enableDeepInsights,
  };
}

/**
 * Check if a feature is enabled using PURE abstraction.
 * This is the canonical way to check feature availability.
 * 
 * @param feature - The feature key to check
 * @param entitlements - The user's entitlements
 * @returns true if the feature is enabled
 */
export function isFeatureEnabled(
  feature: FeatureKey,
  entitlements: PlanEntitlement
): boolean {
  return registryIsEnabled(feature, entitlements);
}

/**
 * Get the entitlement flag key for a feature.
 * Useful for debugging and admin UI.
 */
export function getFeatureEntitlementKey(
  feature: FeatureKey
): keyof PlanEntitlement | undefined {
  return getFeatureEntitlement(feature);
}

/**
 * Model selection based on capabilities (NOT tier strings).
 * Returns the appropriate model based on capability class.
 */
export function resolveModelForCapabilities(capabilities: Capabilities): string {
  // Capability-based model selection
  if (capabilities.modelClass === "premium") {
    return "gpt-4.1";
  }
  return "gpt-4o-mini";
}

/**
 * Inject reasoning guidance based on capabilities (NOT tier strings).
 * This replaces tierReasoning.ts injectTierReasoning().
 */
export function injectCapabilityReasoning(capabilities: Capabilities): string {
  if (capabilities.deepInsights) {
    return `
You are operating in FULL INTELLIGENCE mode.
Provide COMPREHENSIVE analysis:
- Patterns
- Themes
- Distortions
- Behaviour loops
- Traits
- Goals (life + focus)
- Strategies
- Forecasts
- Growth roadmap integration
- Deep, structured reasoning
- Behavioural insights + CBT layered guidance
Do not limit depth.
`.trim();
  }

  if (capabilities.deepDive || capabilities.growthRoadmap || capabilities.architect) {
    return `
You are operating in ENHANCED mode.
Provide:
- Deeper emotional analysis
- Patterns and small insights
- Light loops, themes, and distortions
- Some personalised guidance
- Medium-length reasoning
Avoid:
- Advanced behavioural looping
- Full growth roadmap
- Deep forecasting
`.trim();
  }

  // Standard mode (all users)
  return `
You are Vella's assistant.
You MUST give helpful, simple, friendly explanations.
Keep responses short BUT meaningful.
Provide practical, common-sense reasoning.
Avoid saying "I cannot help" or "consult a professional" unless the user expresses clear self-harm, harm to others, or medical emergency.
Avoid deep psychological analysis (reserved for enhanced modes).
Do NOT repeat phrases. Keep tone warm and natural.
`.trim();
}

/**
 * Build refinement guidance based on capabilities (NOT tier strings).
 * This replaces refineResponse.ts tier-based logic.
 */
export function buildRefinementGuidance(capabilities: Capabilities): string {
  if (capabilities.deepInsights) {
    return "Allow deeper, more nuanced responses, but avoid rambling and repetition.";
  }

  if (capabilities.deepDive || capabilities.architect) {
    return "Provide clear, structured but still concise responses. Some depth, no essays.";
  }

  // Standard mode
  return "Keep responses short, simple, and friendly. Avoid depth and long analysis.";
}

/**
 * Sanitize context based on capabilities (NOT tier strings).
 * Removes premium-only context fields when user lacks capabilities.
 */
export function sanitizeContextForCapabilities(
  capabilities: Capabilities,
  context: unknown
): unknown {
  // If they have deep insights, no sanitization needed
  if (capabilities.deepInsights) {
    return context;
  }

  // If they have deep dive/architect, keep some fields
  if (capabilities.deepDive || capabilities.architect) {
    if (!context || typeof context !== "object") {
      return context;
    }
    const clone: Record<string, unknown> = { ...(context as Record<string, unknown>) };
    // Remove elite-only fields
    delete clone.forecast;
    delete clone.growth;
    return clone;
  }

  // Standard tier - remove all premium context
  if (!context || typeof context !== "object") {
    return context;
  }
  const clone: Record<string, unknown> = { ...(context as Record<string, unknown>) };
  delete clone.patterns;
  delete clone.themes;
  delete clone.loops;
  delete clone.distortions;
  delete clone.traits;
  delete clone.goals;
  delete clone.forecast;
  delete clone.growth;
  delete clone.strategies;
  return clone;
}
