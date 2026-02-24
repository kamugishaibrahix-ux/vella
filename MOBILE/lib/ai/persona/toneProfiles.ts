export const TONE_PROFILES = {
  soft: {
    cadence: "slow",
    directness: 0.2,
    warmth: 0.8,
    playfulness: 0.2,
  },
  warm: {
    cadence: "steady",
    directness: 0.3,
    warmth: 1.0,
    playfulness: 0.3,
  },
  direct: {
    cadence: "fast",
    directness: 0.8,
    warmth: 0.3,
    playfulness: 0.1,
  },
  stoic: {
    cadence: "slow",
    directness: 0.9,
    warmth: 0.1,
    playfulness: 0,
  },
  playful: {
    cadence: "fast",
    directness: 0.4,
    warmth: 0.6,
    playfulness: 0.9,
  },
} as const;

export type ToneProfileKey = keyof typeof TONE_PROFILES;

