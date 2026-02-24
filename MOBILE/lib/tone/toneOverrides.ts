// DIAGNOSTICS ONLY — This file must NEVER influence realtime voice delivery.
// All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.
// Tone overrides are for local diagnostics only, not sent to API or used in instructions.

import type { ToneVector } from "./toneVectors";

export interface ToneOverrideContext {
  relationshipMode?: string;
  toneStyle?: string;
  emotionalState?: {
    warmth: number;
    energy: number;
    clarity: number;
  };
  behaviourVector?: {
    warmthBias: number;
    directnessBias: number;
  };
  safetyFlag?: boolean;
  urgency?: "low" | "normal" | "high";
  topic?: string;
  userEmotion?: string;
  relationshipDepth?: number;
}

export function applyOverrides(base: ToneVector, context: ToneOverrideContext): ToneVector {
  const out = { ...base };
  if (context.safetyFlag) {
    out.warmth = Math.min(1, out.warmth + 0.3);
    out.clarity = Math.max(0.8, out.clarity);
    out.softness = Math.min(1, out.softness + 0.4);
  }
  if (context.urgency === "high") {
    out.energy = Math.max(0.9, out.energy);
    out.clarity = Math.max(0.8, out.clarity);
  }
  return out;
}

