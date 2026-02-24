// DIAGNOSTICS ONLY — This file must NEVER influence realtime voice delivery.
// All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.
// Prosody blending is for local diagnostics only, not sent to API or used in instructions.

import type { ProsodyVector } from "./prosodyVectors";

export function blendProsody(
  a: ProsodyVector,
  b: ProsodyVector,
  f: number,
): ProsodyVector {
  const t = Math.max(0, Math.min(1, f));
  const blend = (x: number, y: number) => x + (y - x) * t;
  return {
    pitch: blend(a.pitch, b.pitch),
    pace: blend(a.pace, b.pace),
    pause: blend(a.pause, b.pause),
    breathiness: blend(a.breathiness, b.breathiness),
    emphasis: blend(a.emphasis, b.emphasis),
  };
}

