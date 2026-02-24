// DIAGNOSTICS ONLY — This file must NEVER influence realtime voice delivery.
// All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.
// Tone resolution is for local diagnostics only, not sent to API or used in instructions.

import { TONE_PRESETS, type ToneVector } from "./toneVectors";

export interface ToneContext {
  userEmotion: string;
  topic: string;
  urgency: string;
  relationshipDepth: number;
}

export function resolveTone(ctx: ToneContext): ToneVector {
  if (ctx.userEmotion === "sad" || ctx.userEmotion === "overwhelmed") {
    return TONE_PRESETS.comforting;
  }
  if (ctx.userEmotion === "excited") {
    return TONE_PRESETS.playful;
  }
  if (ctx.topic === "focus" || ctx.topic === "learning") {
    return TONE_PRESETS.focused;
  }
  if (ctx.urgency === "high") {
    return TONE_PRESETS.motivating;
  }
  if (ctx.relationshipDepth > 0.6) {
    return {
      ...TONE_PRESETS.comforting,
      intimacy: Math.min(1, 0.8 + ctx.relationshipDepth * 0.2),
    };
  }
  return TONE_PRESETS.neutral;
}

