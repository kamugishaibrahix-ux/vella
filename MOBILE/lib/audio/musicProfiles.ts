export const MUSIC_PROFILES = {
  calm: {
    tags: ["ambient", "soft", "slow"],
    energy: 0.2,
    warmth: 0.5,
  },
  focus: {
    tags: ["lofi", "steady", "neutral"],
    energy: 0.4,
    warmth: 0.3,
  },
  bright: {
    tags: ["upbeat", "light", "uplifting"],
    energy: 0.7,
    warmth: 0.6,
  },
  emotional: {
    tags: ["piano", "warm", "emotional"],
    energy: 0.3,
    warmth: 0.9,
  },
  dark: {
    tags: ["deep", "slow", "moody"],
    energy: 0.2,
    warmth: 0.1,
  },
} as const;

export type MusicProfileKey = keyof typeof MUSIC_PROFILES;

