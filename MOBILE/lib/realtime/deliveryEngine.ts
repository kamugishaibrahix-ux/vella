// DIAGNOSTICS ONLY — This file computes delivery hints for personaSynth.ts instruction generation.
// The computed hints are used ONLY to build static persona instruction text.
// These values MUST NEVER be sent as runtime session parameters or used to modify voice delivery at runtime.
// All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.

import { DEFAULT_VELLA_VOICE_ID, type VellaVoiceId } from "@/lib/voice/vellaVoices";
import { computeBreathHints, type BreathHints } from "./breathModel";
import type { EmotionalState } from "./emotion/state";

export type MoodState = "neutral" | "soothing" | "uplifting" | "grounding";

export interface VellaDeliveryContext {
  voiceId: VellaVoiceId;
  moodState: MoodState;
  lastUserEmotion?: string | null;
  speakingRateHint?: "slow" | "medium" | "fast";
  softnessHint?: "soft" | "balanced" | "crisp";
  interruptionRecovery?: boolean;
  emotionalState?: EmotionalState | null;
  musicMode?: string | null;
}

export interface VellaDeliveryHints {
  targetRate: number; // 0–1
  targetSoftness: number; // 0–1
  targetWarmth: number; // 0–1
  breathiness: number; // 0–1
  pitchProfile: "neutral" | "gentle_up" | "gentle_down" | "story_wave";
  rhythmProfile: "even" | "soft_syncopated" | "storytelling";
  expressionBloom: "low" | "medium" | "high";
  breathHints: BreathHints;
}

type VoiceProfile = {
  rate: number;
  softness: number;
  warmth: number;
  breathiness: number;
  pitchProfile: VellaDeliveryHints["pitchProfile"];
  rhythmProfile: VellaDeliveryHints["rhythmProfile"];
  expressionBloom: VellaDeliveryHints["expressionBloom"];
};

type MoodAdjustment = Partial<{
  rate: number;
  softness: number;
  warmth: number;
  breathiness: number;
  expressionBloom: VellaDeliveryHints["expressionBloom"];
}>;

const RATE_BOUNDS = { min: 0.35, max: 0.65 };

const VOICE_BASE_PROFILES: Record<VellaVoiceId, VoiceProfile> = {
  luna: {
    rate: 0.58,
    softness: 0.72,
    warmth: 0.82,
    breathiness: 0.35,
    pitchProfile: "story_wave",
    rhythmProfile: "storytelling",
    expressionBloom: "medium",
  },
  aira: {
    rate: 0.64,
    softness: 0.62,
    warmth: 0.74,
    breathiness: 0.3,
    pitchProfile: "gentle_up",
    rhythmProfile: "soft_syncopated",
    expressionBloom: "high",
  },
  sol: {
    rate: 0.52,
    softness: 0.6,
    warmth: 0.7,
    breathiness: 0.28,
    pitchProfile: "neutral",
    rhythmProfile: "even",
    expressionBloom: "medium",
  },
  orion: {
    rate: 0.45,
    softness: 0.66,
    warmth: 0.8,
    breathiness: 0.32,
    pitchProfile: "gentle_down",
    rhythmProfile: "storytelling",
    expressionBloom: "low",
  },
};

const MOOD_ADJUSTMENTS: Record<MoodState, MoodAdjustment> = {
  neutral: {},
  soothing: {
    rate: -0.05,
    softness: 0.05,
    breathiness: 0.03,
    expressionBloom: "medium",
  },
  uplifting: {
    rate: 0.04,
    warmth: 0.04,
    breathiness: -0.02,
    expressionBloom: "high",
  },
  grounding: {
    rate: -0.02,
    warmth: 0.03,
    softness: 0.02,
    expressionBloom: "low",
  },
};

export function computeDeliveryHints(ctx: VellaDeliveryContext): VellaDeliveryHints {
  const base = VOICE_BASE_PROFILES[ctx.voiceId] ?? VOICE_BASE_PROFILES[DEFAULT_VELLA_VOICE_ID];
  const moodAdj = MOOD_ADJUSTMENTS[ctx.moodState] ?? {};

  let rate = base.rate + (moodAdj.rate ?? 0);
  let softness = base.softness + (moodAdj.softness ?? 0);
  let warmth = base.warmth + (moodAdj.warmth ?? 0);
  let breathiness = base.breathiness + (moodAdj.breathiness ?? 0);
  let expressionBloom = moodAdj.expressionBloom ?? base.expressionBloom;

  if (ctx.speakingRateHint === "fast") {
    rate += 0.05;
  } else if (ctx.speakingRateHint === "slow") {
    rate -= 0.05;
  }

  if (ctx.softnessHint === "soft") {
    softness += 0.04;
    breathiness += 0.02;
  } else if (ctx.softnessHint === "crisp") {
    softness -= 0.04;
    breathiness -= 0.02;
    expressionBloom = expressionBloom === "high" ? "medium" : expressionBloom;
  }

  if (ctx.interruptionRecovery) {
    rate = (rate + base.rate) / 2 - 0.02;
    breathiness += 0.03;
  }

  const emotion = ctx.lastUserEmotion?.toLowerCase() ?? "";
  if (emotion.includes("anxious") || emotion.includes("stressed")) {
    rate -= 0.03;
    softness += 0.03;
    warmth += 0.02;
    expressionBloom = expressionBloom === "high" ? "medium" : expressionBloom;
  } else if (emotion.includes("excited") || emotion.includes("energized")) {
    rate += 0.03;
    breathiness -= 0.01;
    expressionBloom = "high";
  }

  let breathHints = computeBreathHints(ctx);

  if (ctx.emotionalState) {
    const { arousal, tension, warmth: warmthSignal, valence } = ctx.emotionalState;
    const arousalBias = arousal - 0.5; // -0.5 (very calm) to +0.5 (very energized)
    rate += arousalBias * 0.15;
    breathHints = {
      ...breathHints,
      averageSentenceBreaths: clamp(
        breathHints.averageSentenceBreaths * (1 - arousalBias * 0.4),
        0.2,
        1.4,
      ),
      maxBreathsPerTurn: Math.max(
        1,
        Math.round(breathHints.maxBreathsPerTurn * (1 - arousalBias * 0.25)),
      ),
    };

    if (tension > 0.6) {
      softness += 0.04;
      breathiness += 0.02;
      breathHints = {
        ...breathHints,
        averageSentenceBreaths: clamp(breathHints.averageSentenceBreaths + 0.08, 0.25, 1.5),
      };
    }

    if (warmthSignal > 0.65) {
      expressionBloom = "high";
      warmth += 0.03;
    } else if (warmthSignal < 0.35 && expressionBloom === "high") {
      expressionBloom = "medium";
    }

    if (valence < -0.15) {
      softness += 0.02;
      expressionBloom = expressionBloom === "high" ? "medium" : "low";
    }
  }

  return {
    targetRate: clamp(rate, RATE_BOUNDS.min, RATE_BOUNDS.max),
    targetSoftness: clamp(softness),
    targetWarmth: clamp(warmth),
    breathiness: clamp(breathiness),
    pitchProfile: base.pitchProfile,
    rhythmProfile: base.rhythmProfile,
    expressionBloom,
    breathHints,
  };
}

function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

