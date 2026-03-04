"use server";

import type { AdminAIConfig } from "@/lib/admin/adminConfigTypes";

/**
 * Minimal runtime tuning adapter for local-first architecture.
 * Only includes runtime guardrails, safety controls, and global flags.
 * Persona/behaviour/voice/memory tuning removed (handled locally per-device).
 */
export type RuntimeTuning = {
  // Runtime Configuration
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

  // Safety & Guardrails
  safety: {
    safetyStrictness: number; // 0–100
    redFlagSensitivity: number; // 0–100
    attachmentPrevention: boolean;
    hallucinationReducer: boolean;
    destabilizationGuard: boolean;
    filterStrength: number; // 0–100
    outputSmoothing: number; // 0–100
  };

  // Persona (admin-blended dials; 0–100)
  persona: {
    empathy: number;
    directness: number;
    energy: number;
  };

  // Behaviour (admin-blended dials; 0–100)
  behaviour: {
    playfulness: number;
    emotionalContainment: number;
    analyticalDepth: number;
    introspectionDepth: number;
    conciseness: number;
  };

  // Memory (for distress scoring etc.)
  memory: {
    emotionalWeighting: number; // 0–100
  };

  // Global Flags
  flags: {
    maintenanceMode: boolean;
    enableVoice: boolean;
    enableRealtime: boolean;
    enableMusicMode: boolean;
  };

  // Token Limits
  limits: {
    maxDailyTokensPerUser: number;
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
    generation: {
      temperature: clampRange(config.model?.temperature, 0, 2, 0.4),
      topP: 0.9,
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
  safety: {
      safetyStrictness: clampPercent(config.safety?.safety_strictness, 82),
      redFlagSensitivity: clampPercent(config.safety?.red_flag_sensitivity, 76),
      attachmentPrevention: config.safety?.attachment_prevention ?? true,
      hallucinationReducer: config.safety?.hallucination_reducer ?? true,
      destabilizationGuard: config.safety?.destabilization_guard ?? true,
      filterStrength: clampPercent((config.safety as { filter_strength?: number })?.filter_strength, 90),
      outputSmoothing: clampPercent((config.safety as { output_smoothing?: number })?.output_smoothing, 50),
    },
    persona: {
      empathy: clampPercent((config as { persona?: { empathy?: number } }).persona?.empathy, 75),
      directness: clampPercent((config as { persona?: { directness?: number } }).persona?.directness, 60),
      energy: clampPercent((config as { persona?: { energy?: number } }).persona?.energy, 50),
    },
    behaviour: {
      playfulness: clampPercent((config as { behaviour?: { playfulness?: number } }).behaviour?.playfulness, 40),
      emotionalContainment: clampPercent((config as { behaviour?: { emotional_containment?: number } }).behaviour?.emotional_containment, 70),
      analyticalDepth: clampPercent((config as { behaviour?: { analytical_depth?: number } }).behaviour?.analytical_depth, 50),
      introspectionDepth: clampPercent((config as { behaviour?: { introspection_depth?: number } }).behaviour?.introspection_depth, 50),
      conciseness: clampPercent((config as { behaviour?: { conciseness?: number } }).behaviour?.conciseness, 60),
    },
    memory: {
      emotionalWeighting: clampPercent((config as { memory?: { emotional_weighting?: number } }).memory?.emotional_weighting, 52),
    },
    flags: {
      maintenanceMode: config.flags?.maintenanceMode ?? false,
      enableVoice: config.flags?.enableVoice ?? true,
      enableRealtime: config.flags?.enableRealtime ?? true,
      enableMusicMode: config.flags?.enableMusicMode ?? false,
    },
    limits: {
      maxDailyTokensPerUser: config.limits?.maxDailyTokensPerUser ?? 50000,
    },
  };
}

function getDefaultTuning(): RuntimeTuning {
  return {
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
    safety: {
      safetyStrictness: 82,
      redFlagSensitivity: 76,
      attachmentPrevention: true,
      hallucinationReducer: true,
      destabilizationGuard: true,
      filterStrength: 90,
      outputSmoothing: 50,
    },
    persona: {
      empathy: 75,
      directness: 60,
      energy: 50,
    },
    behaviour: {
      playfulness: 40,
      emotionalContainment: 70,
      analyticalDepth: 50,
      introspectionDepth: 50,
      conciseness: 60,
    },
    memory: {
      emotionalWeighting: 52,
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
  };
}
