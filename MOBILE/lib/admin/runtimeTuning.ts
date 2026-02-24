"use server";

import type { AdminAIConfig } from "@/lib/admin/adminConfigTypes";

/**
 * Runtime tuning adapter - converts AdminAIConfig into runtime dials.
 * All values are clamped to safe ranges and validated.
 */
export type RuntimeTuning = {
  persona: {
    empathy: number; // 0–100
    directness: number; // 0–100
    energy: number; // 0–100
  };
  behaviour: {
    empathyRegulation: number;
    directness: number;
    emotionalContainment: number;
    analyticalDepth: number;
    playfulness: number;
    introspectionDepth: number;
    conciseness: number;
    safetyStrictness: number;
  };
  voice: {
    softness: number;
    cadence: number;
    breathiness: number;
    pauseLength: number;
    whisperSensitivity: number;
    warmth: number;
    interruptionRecovery: number;
  };
  generation: {
    temperature: number; // 0–2
    topP: number; // 0–1
    maxOutputTokens: number; // 200–4000
  };
  models: {
    textModel: string;
    realtimeModel: string;
    embeddingModel: string;
    reasoningDepth: "Light" | "Normal" | "Analytical" | "Deep";
  };
  memory: {
    selectivity: number;
    maxContextTurns: number;
    ragRecallStrength: number;
    emotionalWeighting: number;
  };
  safety: {
    filterStrength: number;
    redFlagSensitivity: number;
    outputSmoothing: number;
  };
  automation: {
    [key: string]: boolean;
  };
};

// Allowed cheap models only
const ALLOWED_TEXT_MODELS = new Set([
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4o-mini-tts",
  "gpt-4o-light",
]);

const ALLOWED_REALTIME_MODELS = new Set([
  "gpt-4o-realtime-preview",
  "gpt-4o-realtime-mini",
  "gpt-4o-mini",
]);

const ALLOWED_EMBEDDING_MODELS = new Set(["text-embedding-3-small", "text-embedding-3-large"]);

// Default models matching current Vella baseline
const DEFAULT_TEXT_MODEL = "gpt-4o-mini";
const DEFAULT_REALTIME_MODEL = "gpt-4o-realtime-preview";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function clampPercent(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampRange(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function safeModel(
  model: string | undefined,
  allowed: Set<string>,
  fallback: string,
): string {
  if (!model || typeof model !== "string") return fallback;
  return allowed.has(model) ? model : fallback;
}

function safeReasoningDepth(
  depth: string | undefined,
): "Light" | "Normal" | "Analytical" | "Deep" {
  if (!depth || typeof depth !== "string") return "Normal";
  const valid = ["Light", "Normal", "Analytical", "Deep"] as const;
  return valid.includes(depth as typeof valid[number]) ? (depth as typeof valid[number]) : "Normal";
}

/**
 * Loads and adapts admin config into runtime tuning.
 * Never throws - always returns a fully populated RuntimeTuning with safe defaults.
 */
export async function loadRuntimeTuning(): Promise<RuntimeTuning> {
  try {
    // Dynamic import to avoid bundling server-only code in client components
    const { loadActiveAdminAIConfig } = await import("@/lib/admin/adminConfig");
    const config = await loadActiveAdminAIConfig();
    return adaptConfigToTuning(config);
  } catch (error) {
    console.error("[runtimeTuning] Failed to load admin config, using defaults", error);
    return getDefaultTuning();
  }
}

function adaptConfigToTuning(config: AdminAIConfig): RuntimeTuning {
  return {
    persona: {
      empathy: clampPercent(config.persona?.empathy, 80),
      directness: clampPercent(config.persona?.directness, 45),
      energy: clampPercent(config.persona?.energy, 55),
    },
    behaviour: {
      empathyRegulation: clampPercent(config.behaviour?.empathy_regulation, 72),
      directness: clampPercent(config.behaviour?.directness, 48),
      emotionalContainment: clampPercent(config.behaviour?.emotional_containment, 63),
      analyticalDepth: clampPercent(config.behaviour?.analytical_depth, 67),
      playfulness: clampPercent(config.behaviour?.playfulness, 34),
      introspectionDepth: clampPercent(config.behaviour?.introspection_depth, 58),
      conciseness: clampPercent(config.behaviour?.conciseness, 41),
      safetyStrictness: clampPercent(config.behaviour?.safety_strictness, 82),
    },
    voice: {
      softness: clampPercent(config.voice?.softness, 65),
      cadence: clampPercent(config.voice?.cadence, 54),
      breathiness: clampPercent(config.voice?.breathiness, 46),
      pauseLength: clampPercent(config.voice?.pause_length, 38),
      whisperSensitivity: clampPercent(config.voice?.whisper_sensitivity, 42),
      warmth: clampPercent(config.voice?.warmth, 71),
      interruptionRecovery: clampPercent(config.voice?.interruption_recovery, 58),
    },
    generation: {
      temperature: clampRange(config.model?.temperature, 0, 2, 0.4),
      topP: clampRange(config.model?.top_p, 0, 1, 0.9),
      maxOutputTokens: clampRange(config.model?.max_output, 200, 4000, 2000),
    },
    models: {
      textModel: safeModel(config.models?.text_model, ALLOWED_TEXT_MODELS, DEFAULT_TEXT_MODEL),
      realtimeModel: safeModel(
        config.models?.realtime_model,
        ALLOWED_REALTIME_MODELS,
        DEFAULT_REALTIME_MODEL,
      ),
      embeddingModel: safeModel(
        config.models?.embedding_model,
        ALLOWED_EMBEDDING_MODELS,
        DEFAULT_EMBEDDING_MODEL,
      ),
      reasoningDepth: safeReasoningDepth(config.models?.reasoning_depth),
    },
    memory: {
      selectivity: clampPercent(config.memory?.selectivity, 58),
      maxContextTurns: clampRange(config.memory?.context_history, 5, 50, 18),
      ragRecallStrength: clampPercent(config.memory?.rag_recall_strength, 64),
      emotionalWeighting: clampPercent(config.memory?.emotional_weighting, 52),
    },
    safety: {
      filterStrength: clampPercent(config.safety?.filter_strength, 90),
      redFlagSensitivity: clampPercent(config.safety?.red_flag_sensitivity, 76),
      outputSmoothing: clampPercent(config.safety?.output_smoothing, 48),
    },
    automation: {
      ...(config.automation ?? {}),
    },
  };
}

function getDefaultTuning(): RuntimeTuning {
  return {
    persona: {
      empathy: 80,
      directness: 45,
      energy: 55,
    },
    behaviour: {
      empathyRegulation: 72,
      directness: 48,
      emotionalContainment: 63,
      analyticalDepth: 67,
      playfulness: 34,
      introspectionDepth: 58,
      conciseness: 41,
      safetyStrictness: 82,
    },
    voice: {
      softness: 65,
      cadence: 54,
      breathiness: 46,
      pauseLength: 38,
      whisperSensitivity: 42,
      warmth: 71,
      interruptionRecovery: 58,
    },
    generation: {
      temperature: 0.4,
      topP: 0.9,
      maxOutputTokens: 2000,
    },
    models: {
      textModel: DEFAULT_TEXT_MODEL,
      realtimeModel: DEFAULT_REALTIME_MODEL,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      reasoningDepth: "Normal",
    },
    memory: {
      selectivity: 58,
      maxContextTurns: 18,
      ragRecallStrength: 64,
      emotionalWeighting: 52,
    },
    safety: {
      filterStrength: 90,
      redFlagSensitivity: 76,
      outputSmoothing: 48,
    },
    automation: {},
  };
}

