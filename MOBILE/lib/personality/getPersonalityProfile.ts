import { serverLocalGet } from "@/lib/local/serverLocal";

export type PersonalityProfile = {
  warmth: number;
  directness: number;
  optimism: number;
  humour: number;
  stoic_clarity: number;
  empathy: number;
  pacing: "slow" | "medium" | "fast";
  expressiveness: number;
};

const DEFAULT_PERSONALITY: PersonalityProfile = {
  warmth: 0.7,
  directness: 0.4,
  optimism: 0.5,
  humour: 0.2,
  stoic_clarity: 0.6,
  empathy: 0.8,
  pacing: "medium",
  expressiveness: 0.6,
};

export async function getPersonalityProfile(userId: string | null): Promise<PersonalityProfile> {
  if (!userId) {
    return DEFAULT_PERSONALITY;
  }
  try {
    const data = await serverLocalGet(`vella_personality:${userId}`);
    const row = data as { traits?: PersonalityProfile } | null;
    const traits = (row?.traits as PersonalityProfile | undefined) ?? DEFAULT_PERSONALITY;
    return normalizePersonality(traits);
  } catch (error) {
    console.error("[getPersonalityProfile] error", error);
    return DEFAULT_PERSONALITY;
  }
}

export function getDefaultPersonality(): PersonalityProfile {
  return { ...DEFAULT_PERSONALITY };
}

function normalizePersonality(profile: PersonalityProfile): PersonalityProfile {
  return {
    warmth: clamp(profile.warmth, DEFAULT_PERSONALITY.warmth),
    directness: clamp(profile.directness, DEFAULT_PERSONALITY.directness),
    optimism: clamp(profile.optimism, DEFAULT_PERSONALITY.optimism),
    humour: clamp(profile.humour, DEFAULT_PERSONALITY.humour),
    stoic_clarity: clamp(profile.stoic_clarity, DEFAULT_PERSONALITY.stoic_clarity),
    empathy: clamp(profile.empathy, DEFAULT_PERSONALITY.empathy),
    pacing: profile.pacing ?? DEFAULT_PERSONALITY.pacing,
    expressiveness: clamp(profile.expressiveness, DEFAULT_PERSONALITY.expressiveness),
  };
}

function clamp(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

