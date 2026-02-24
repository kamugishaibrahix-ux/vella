// DIAGNOSTICS ONLY — This file must NEVER influence realtime voice delivery.
// All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.
// Prosody stabilization is for local diagnostics only, not sent to API or used in instructions.

import type { ProsodyVector } from "@/lib/tone/prosodyVectors";

export function stabilizeProsody(p: ProsodyVector, stability: number): ProsodyVector {
  const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
  const factor = 0.7 + stability * 0.3;
  return {
    pitch: clamp(p.pitch * factor, 0.1, 1),
    pace: clamp(p.pace * factor, 0.1, 1),
    pause: clamp(p.pause * factor, 0.1, 1),
    breathiness: clamp(p.breathiness * factor, 0.1, 1),
    emphasis: clamp(p.emphasis * factor, 0.1, 1),
  };
}

