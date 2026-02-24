"use server";

import { generateEmotionalPatterns } from "@/lib/insights/patterns";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";

export async function getEmotionalPatterns(userId: string | null) {
  if (!userId) {
    return { patterns: EMPTY_PATTERNS, planTier: "free" as const, mode: "lite" as const, fallbackReason: "missing-user" };
  }
  try {
    const personaSettings = await loadServerPersonaSettings(userId);
    const language = personaSettings?.language ?? "en";
    return await generateEmotionalPatterns(userId, language, personaSettings);
  } catch (error) {
    // silent fallback
    return { patterns: EMPTY_PATTERNS, planTier: "free" as const, mode: "lite" as const, fallbackReason: "error" };
  }
}

const EMPTY_PATTERNS = {
  commonPrimaryEmotions: [],
  commonTriggers: [],
  commonFears: [],
  emotionalTendencies: [],
};

