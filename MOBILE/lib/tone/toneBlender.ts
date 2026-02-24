// DIAGNOSTICS ONLY — This file must NEVER influence realtime voice delivery.
// All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.
// Tone blending is for local diagnostics only, not sent to API or used in instructions.

import type { ToneVector } from "./toneVectors";

export function blendTone(a: ToneVector, b: ToneVector, factor: number): ToneVector {
  const f = Math.max(0, Math.min(1, factor));
  return {
    warmth: a.warmth + (b.warmth - a.warmth) * f,
    softness: a.softness + (b.softness - a.softness) * f,
    clarity: a.clarity + (b.clarity - a.clarity) * f,
    energy: a.energy + (b.energy - a.energy) * f,
    intimacy: a.intimacy + (b.intimacy - a.intimacy) * f,
    grounding: a.grounding + (b.grounding - a.grounding) * f,
  };
}

