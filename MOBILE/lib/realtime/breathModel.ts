import type { VellaDeliveryContext } from "./deliveryEngine";
import { DEFAULT_VELLA_VOICE_ID, type VellaVoiceId } from "@/lib/voice/vellaVoices";

export interface BreathHints {
  averageSentenceBreaths: number;
  maxBreathsPerTurn: number;
  breathSoftness: number; // 0–1
}

const BREATH_BASELINES: Record<VellaVoiceId, BreathHints> = {
  luna: {
    averageSentenceBreaths: 0.42,
    maxBreathsPerTurn: 3,
    breathSoftness: 0.75,
  },
  aira: {
    averageSentenceBreaths: 0.45,
    maxBreathsPerTurn: 3,
    breathSoftness: 0.7,
  },
  sol: {
    averageSentenceBreaths: 0.36,
    maxBreathsPerTurn: 2.5,
    breathSoftness: 0.6,
  },
  orion: {
    averageSentenceBreaths: 0.34,
    maxBreathsPerTurn: 2.2,
    breathSoftness: 0.68,
  },
};

export function computeBreathHints(ctx: VellaDeliveryContext): BreathHints {
  const base =
    BREATH_BASELINES[ctx.voiceId] ?? BREATH_BASELINES[DEFAULT_VELLA_VOICE_ID];
  let average = base.averageSentenceBreaths;
  let maxBreaths = base.maxBreathsPerTurn;
  let softness = base.breathSoftness;

  switch (ctx.moodState) {
    case "soothing":
      average += 0.04;
      softness += 0.05;
      break;
    case "grounding":
      average += 0.02;
      softness += 0.03;
      break;
    case "uplifting":
      average -= 0.03;
      softness -= 0.04;
      break;
    case "neutral":
    default:
      break;
  }

  if (ctx.interruptionRecovery) {
    average += 0.03;
    softness += 0.04;
  }

  return {
    averageSentenceBreaths: clampRatio(average),
    maxBreathsPerTurn: Math.max(1.5, Math.min(4, maxBreaths)),
    breathSoftness: clampRatio(softness),
  };
}

function clampRatio(value: number): number {
  if (Number.isNaN(value)) return 0.4;
  return Math.min(1, Math.max(0, value));
}

