/**
 * Admin AI Configuration type - mirrors the structure from Vella Control.
 * All fields are optional to maintain forward compatibility.
 */
export interface AdminAIConfig {
  persona?: {
    empathy?: number;
    directness?: number;
    energy?: number;
  };
  behaviour?: {
    empathy_regulation?: number;
    directness?: number;
    emotional_containment?: number;
    analytical_depth?: number;
    playfulness?: number;
    introspection_depth?: number;
    conciseness?: number;
    safety_strictness?: number;
  };
  voice?: {
    softness?: number;
    cadence?: number;
    breathiness?: number;
    pause_length?: number;
    whisper_sensitivity?: number;
    warmth?: number;
    interruption_recovery?: number;
  };
  model?: {
    temperature?: number;
    top_p?: number;
    max_output?: number;
  };
  models?: {
    text_model?: string;
    realtime_model?: string;
    embedding_model?: string;
    reasoning_depth?: "Light" | "Normal" | "Analytical" | "Deep";
  };
  memory?: {
    selectivity?: number;
    context_history?: number;
    rag_recall_strength?: number;
    emotional_weighting?: number;
    long_term?: boolean;
    emotional_memory?: boolean;
    continuity?: boolean;
    insight_retention?: boolean;
  };
  safety?: {
    filter_strength?: number;
    red_flag_sensitivity?: number;
    output_smoothing?: number;
    hallucination_reducer?: boolean;
    destabilization_guard?: boolean;
    topic_boundary?: boolean;
    over_empathy_limiter?: boolean;
    harmful_content_purifier?: boolean;
    attachment_prevention?: boolean;
    repetition_breaker?: boolean;
    sentiment_correction?: boolean;
  };
  hidden_modules?: {
    mentorMode?: boolean;
    therapistMode?: boolean;
    stoicMode?: boolean;
    coachingMode?: boolean;
    listeningMode?: boolean;
    childSafeMode?: boolean;
    noAttachmentMode?: boolean;
  };
  automation?: {
    insightInjection?: boolean;
    storytellingEnhancement?: boolean;
    motivationalReframes?: boolean;
    moodAdaptive?: boolean;
    contextualPacing?: boolean;
  };
  persona_instruction?: string;
  flags?: Record<string, boolean>;
  // Allow unknown future keys without breaking type-checking
  [key: string]: unknown;
}

/**
 * Default admin AI configuration that matches Vella's current baseline behavior.
 * This is used when no admin config exists in the database.
 */
export const DEFAULT_ADMIN_AI_CONFIG: AdminAIConfig = {
  persona: {
    empathy: 80,
    directness: 45,
    energy: 55,
  },
  behaviour: {
    empathy_regulation: 72,
    directness: 48,
    emotional_containment: 63,
    analytical_depth: 67,
    playfulness: 34,
    introspection_depth: 58,
    conciseness: 41,
    safety_strictness: 82,
  },
  voice: {
    softness: 65,
    cadence: 54,
    breathiness: 46,
    pause_length: 38,
    whisper_sensitivity: 42,
    warmth: 71,
    interruption_recovery: 58,
  },
  models: {
    text_model: "gpt-4o-mini",
    realtime_model: "gpt-4o-mini",
    embedding_model: "text-embedding-3-small",
    reasoning_depth: "Normal",
  },
  memory: {
    selectivity: 58,
    context_history: 18,
    rag_recall_strength: 64,
    emotional_weighting: 52,
    long_term: false,
    emotional_memory: false,
    continuity: false,
    insight_retention: false,
  },
  safety: {
    filter_strength: 90,
    red_flag_sensitivity: 76,
    output_smoothing: 48,
    hallucination_reducer: false,
    destabilization_guard: false,
    topic_boundary: false,
    over_empathy_limiter: false,
    harmful_content_purifier: false,
    attachment_prevention: false,
    repetition_breaker: false,
    sentiment_correction: false,
  },
  automation: {},
  flags: {},
};

/**
 * Merges database JSON config into the default config, preserving defaults for missing fields.
 */
export async function mergeAdminAIConfig(
  dbConfig: Partial<AdminAIConfig> | null | undefined,
): Promise<AdminAIConfig> {
  if (!dbConfig || typeof dbConfig !== "object") {
    return DEFAULT_ADMIN_AI_CONFIG;
  }

  return {
    ...DEFAULT_ADMIN_AI_CONFIG,
    ...dbConfig,
    persona: {
      ...DEFAULT_ADMIN_AI_CONFIG.persona,
      ...(dbConfig.persona ?? {}),
    },
    behaviour: {
      ...DEFAULT_ADMIN_AI_CONFIG.behaviour,
      ...(dbConfig.behaviour ?? {}),
    },
    voice: {
      ...DEFAULT_ADMIN_AI_CONFIG.voice,
      ...(dbConfig.voice ?? {}),
    },
    model: {
      ...DEFAULT_ADMIN_AI_CONFIG.model,
      ...(dbConfig.model ?? {}),
    },
    models: {
      ...DEFAULT_ADMIN_AI_CONFIG.models,
      ...(dbConfig.models ?? {}),
    },
    memory: {
      ...DEFAULT_ADMIN_AI_CONFIG.memory,
      ...(dbConfig.memory ?? {}),
    },
    safety: {
      ...DEFAULT_ADMIN_AI_CONFIG.safety,
      ...(dbConfig.safety ?? {}),
    },
    hidden_modules: {
      ...DEFAULT_ADMIN_AI_CONFIG.hidden_modules,
      ...(dbConfig.hidden_modules ?? {}),
    },
    automation: {
      ...DEFAULT_ADMIN_AI_CONFIG.automation,
      ...(dbConfig.automation ?? {}),
    },
    flags: {
      ...DEFAULT_ADMIN_AI_CONFIG.flags,
      ...(dbConfig.flags ?? {}),
    },
  };
}

