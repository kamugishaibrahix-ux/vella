/**
 * Canonical Token Cost Schedule
 * Single source of truth for AI feature token costs.
 * All usage charging should reference this schedule.
 * Phase 1: Added memory-aware token estimation for chat_text.
 */

export type FeatureKey =
  | "chat_text"
  | "realtime_session"
  | "realtime_offer"
  | "voice_standard"
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

export type TokenChannel = "text" | "realtime" | "audio";

export interface CostScheduleEntry {
  baseTokens: number;
  channel: TokenChannel;
  description?: string;
}

/**
 * Canonical token cost schedule.
 * Values match current estimates from codebase (read from API routes).
 * Variable-cost features have baseTokens=0 - caller must provide actual.
 */
export const TOKEN_COST_SCHEDULE: Record<FeatureKey, CostScheduleEntry> = {
  // Variable cost: depends on message length + memory context (estimated as input/4 + memory/4 + 1000)
  chat_text: {
    baseTokens: 0,
    channel: "text",
    description: "Variable: (input + memory)/4 + 1000 tokens. Caller must provide actual textTokens and memoryChars.",
  },

  // Realtime features
  realtime_session: {
    baseTokens: 750,
    channel: "realtime",
    description: "Session creation (500-1000 range)",
  },
  realtime_offer: {
    baseTokens: 500,
    channel: "realtime",
    description: "WebRTC SDP negotiation",
  },

  // Standard voice (turn-based HTTP: STT → LLM → TTS)
  voice_standard: {
    baseTokens: 2000,
    channel: "audio",
    description: "Standard turn-based voice (STT + LLM + TTS over HTTP)",
  },

  // Audio features
  voice_tts: {
    baseTokens: 5000,
    channel: "audio",
    description: "Single audio clip generation",
  },
  audio_vella: {
    baseTokens: 3500,
    channel: "audio",
    description: "Vella audio generation (meditation/music/ambience)",
  },
  transcribe: {
    baseTokens: 1000,
    channel: "audio",
    description: "Whisper transcription (depends on audio duration)",
  },

  // AI insights/analysis features
  insights_generate: {
    baseTokens: 3000,
    channel: "text",
    description: "Insights generation with persona context",
  },
  insights_patterns: {
    baseTokens: 2500,
    channel: "text",
    description: "Pattern detection from check-ins",
  },
  deepdive: {
    baseTokens: 1200,
    channel: "text",
    description: "Deep dive analysis",
  },
  architect: {
    baseTokens: 1000,
    channel: "text",
    description: "Life architect planning",
  },
  reflection: {
    baseTokens: 4000,
    channel: "text",
    description: "AI reflection generation (large output)",
  },
  strategy: {
    baseTokens: 500,
    channel: "text",
    description: "Strategy formulation",
  },
  compass: {
    baseTokens: 500,
    channel: "text",
    description: "Compass guidance",
  },
  emotion_intel: {
    baseTokens: 700,
    channel: "text",
    description: "Emotional intelligence analysis",
  },

  // Variable cost: depends on persona input size
  growth_roadmap: {
    baseTokens: 2000,
    channel: "text",
    description: "Base 2000 + persona input/4. Caller must provide actual if persona present.",
  },

  clarity: {
    baseTokens: 500,
    channel: "text",
    description: "Clarity analysis",
  },
  deep_insights: {
    baseTokens: 4000,
    channel: "text",
    description: "Elite-tier advanced insights generation (large output)",
  },
};

/**
 * Channel conversion rates.
 * How each channel converts to token units.
 */
export const CHANNEL_RATES = {
  text: { unit: "token", multiplier: 1 },
  realtime: { unit: "second", multiplier: 20 }, // 1 sec = 20 tokens
  audio: { unit: "clip", multiplier: 5000 }, // 1 clip = 5000 tokens
} as const;

/**
 * Estimate tokens for a feature.
 *
 * Logic:
 * - text: use provided textTokens if present, else baseTokens. If memoryChars provided, adds memoryChars/4.
 * - realtime: seconds*20 if seconds present, else baseTokens
 * - audio: clips*5000 if clips present, else baseTokens
 *
 * Phase 1: Added memoryChars support for chat_text to account for memory context injection.
 *
 * @param feature - The feature being used
 * @param actual - Optional actual usage metrics
 * @returns Estimated token cost (>= 0)
 */
export function estimateTokens(
  feature: FeatureKey,
  actual?: {
    textTokens?: number;
    seconds?: number;
    clips?: number;
    memoryChars?: number; // Phase 1: Memory context character count for chat_text
  }
): number {
  const schedule = TOKEN_COST_SCHEDULE[feature];
  if (!schedule) {
    console.warn(`[costSchedule] Unknown feature: ${feature}, returning 0`);
    return 0;
  }

  const { baseTokens, channel } = schedule;

  // Clamp all inputs to >= 0
  const safeActual = {
    textTokens: Math.max(0, actual?.textTokens ?? 0),
    seconds: Math.max(0, actual?.seconds ?? 0),
    clips: Math.max(0, actual?.clips ?? 0),
    memoryChars: Math.max(0, actual?.memoryChars ?? 0),
  };

  switch (channel) {
    case "text": {
      // Phase 1: Include memory context in token estimate
      let totalTokens = baseTokens;
      if (safeActual.textTokens > 0) {
        totalTokens = safeActual.textTokens;
      }
      // Add memory context tokens: chars/4 (standard tokenizer approximation)
      if (safeActual.memoryChars > 0) {
        const memoryTokens = Math.ceil(safeActual.memoryChars / 4);
        totalTokens += memoryTokens;
      }
      return totalTokens;
    }

    case "realtime": {
      // Convert seconds to tokens (20 tokens/sec)
      if (safeActual.seconds > 0) {
        return safeActual.seconds * CHANNEL_RATES.realtime.multiplier;
      }
      return baseTokens;
    }

    case "audio": {
      // Convert clips to tokens (5000 tokens/clip)
      if (safeActual.clips > 0) {
        return safeActual.clips * CHANNEL_RATES.audio.multiplier;
      }
      return baseTokens;
    }

    default:
      return baseTokens;
  }
}

/**
 * Get channel for a feature.
 * Useful for routing to different quota checks.
 */
export function getFeatureChannel(feature: FeatureKey): TokenChannel {
  return TOKEN_COST_SCHEDULE[feature]?.channel ?? "text";
}

/**
 * Check if a feature has variable cost.
 * Variable features require actual usage metrics for accurate billing.
 */
export function isVariableCost(feature: FeatureKey): boolean {
  return TOKEN_COST_SCHEDULE[feature]?.baseTokens === 0;
}
