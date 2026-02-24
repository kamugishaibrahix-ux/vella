export interface ToneVector {
  warmth: number;
  softness: number;
  clarity: number;
  energy: number;
  intimacy: number;
  grounding: number;
}

export const TONE_PRESETS: Record<string, ToneVector> = {
  neutral: {
    warmth: 0.4,
    softness: 0.4,
    clarity: 0.7,
    energy: 0.5,
    intimacy: 0.3,
    grounding: 0.5,
  },
  comforting: {
    warmth: 0.8,
    softness: 0.85,
    clarity: 0.6,
    energy: 0.3,
    intimacy: 0.8,
    grounding: 0.9,
  },
  motivating: {
    warmth: 0.6,
    softness: 0.4,
    clarity: 0.9,
    energy: 0.9,
    intimacy: 0.4,
    grounding: 0.6,
  },
  playful: {
    warmth: 0.7,
    softness: 0.5,
    clarity: 0.7,
    energy: 0.8,
    intimacy: 0.6,
    grounding: 0.4,
  },
  focused: {
    warmth: 0.3,
    softness: 0.3,
    clarity: 1.0,
    energy: 0.7,
    intimacy: 0.2,
    grounding: 0.8,
  },
};

