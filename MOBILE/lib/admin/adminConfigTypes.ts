import type { PlanEntitlementsConfig } from "@/lib/plans/types";

/**
 * Admin AI Configuration type - minimal schema for local-first architecture.
 * Only includes runtime guardrails, safety controls, and global flags.
 * Aligned with Vella Control restructure (persona/behaviour/voice tuning removed).
 */
export interface AdminAIConfig {
  // Runtime Configuration
  models?: {
    text_model?: string;
    realtime_model?: string;
    embedding_model?: string;
    reasoning_depth?: "Light" | "Normal" | "Analytical" | "Deep";
  };
  model?: {
    temperature?: number;
    max_output?: number;
  };

  // Safety & Guardrails
  safety?: {
    safety_strictness?: number;
    red_flag_sensitivity?: number;
    attachment_prevention?: boolean;
    hallucination_reducer?: boolean;
    destabilization_guard?: boolean;
    topic_boundary?: boolean;
    harmful_content_purifier?: boolean;
    repetition_breaker?: boolean;
    sentiment_correction?: boolean;
    over_empathy_limiter?: boolean;
  };

  // Automation toggles (personaSynth)
  automation?: {
    storytellingEnhancement?: boolean;
    moodAdaptive?: boolean;
    contextualPacing?: boolean;
    motivationalReframes?: boolean;
  };

  // Admin override instruction (personaSynth)
  persona_instruction?: string;

  // Global System Flags
  flags?: {
    maintenanceMode?: boolean;
    enableVoice?: boolean;
    enableRealtime?: boolean;
    enableMusicMode?: boolean;
  };

  // Token Limits
  limits?: {
    maxDailyTokensPerUser?: number;
  };

  // Plan Entitlements (admin-controlled tier definitions)
  planEntitlements?: PlanEntitlementsConfig;

  // Allow unknown future keys without breaking type-checking
  [key: string]: unknown;
}

/**
 * Default admin AI configuration - minimal runtime defaults.
 * All persona/behaviour/voice tuning removed (handled locally per-device).
 */
export const DEFAULT_ADMIN_AI_CONFIG: AdminAIConfig = {
  models: {
    text_model: "gpt-4o-mini",
    realtime_model: "gpt-4o-realtime-preview",
    embedding_model: "text-embedding-3-small",
    reasoning_depth: "Normal",
  },
  model: {
    temperature: 0.4,
    max_output: 2000,
  },
  safety: {
    safety_strictness: 82,
    red_flag_sensitivity: 76,
    attachment_prevention: true,
    hallucination_reducer: true,
    destabilization_guard: true,
  },
  flags: {
    maintenanceMode: false,
    enableVoice: true,
    enableRealtime: true,
    enableMusicMode: false,
  },
  limits: {
    maxDailyTokensPerUser: 50000,
  },
  planEntitlements: undefined, // Resolved at runtime via defaults
};

/**
 * Merge partial config with defaults.
 * Handles nested objects and preserves planEntitlements if provided.
 */
export function mergeAdminAIConfig(partial: Partial<AdminAIConfig>): AdminAIConfig {
  return {
    ...DEFAULT_ADMIN_AI_CONFIG,
    ...partial,
    models: { ...DEFAULT_ADMIN_AI_CONFIG.models, ...partial.models },
    model: { ...DEFAULT_ADMIN_AI_CONFIG.model, ...partial.model },
    safety: { ...DEFAULT_ADMIN_AI_CONFIG.safety, ...partial.safety },
    flags: { ...DEFAULT_ADMIN_AI_CONFIG.flags, ...partial.flags },
    limits: { ...DEFAULT_ADMIN_AI_CONFIG.limits, ...partial.limits },
    // planEntitlements is only merged if explicitly provided
    planEntitlements: partial.planEntitlements,
  };
}
