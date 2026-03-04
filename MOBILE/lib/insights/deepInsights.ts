"use server";

import { runFullAI, resolveModelForTier } from "@/lib/ai/fullAI";
import { listJournalEntries } from "@/lib/journal/server";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { getEmotionalPatterns } from "@/lib/patterns/getEmotionalPatterns";
import { getLifeThemes } from "@/lib/insights/lifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { loadBehaviourMap } from "@/lib/behaviour/loadBehaviourMap";
import { loadSocialModel } from "@/lib/social/loadSocialModel";
import { loadSleepEnergyModel } from "@/lib/sleep/loadSleepEnergyModel";
import { listMemorySnapshots } from "@/lib/memory/listMemorySnapshots";
import { buildPersonaInstruction } from "@/lib/realtime/personaSynth";
import {
  computeDeliveryHints,
  type MoodState,
} from "@/lib/realtime/deliveryEngine";
import { DEFAULT_VELLA_VOICE_ID } from "@/lib/voice/vellaVoices";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";

export type DeepInsight = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  theme: string;
  impactArea: string;
  suggestedFocus: string;
};

export type DeepInsightBundle = {
  generatedAt: string;
  insights: DeepInsight[];
};

const DEFAULT_VOICE_HUD = {
  moodChip: true,
  stability: true,
  deliveryHints: true,
  sessionTime: true,
  tokenChip: true,
  strategyChip: true,
  alertChip: true,
};

export async function generateDeepInsights(userId: string): Promise<DeepInsightBundle> {
  if (!userId) {
    return { generatedAt: new Date().toISOString(), insights: [] };
  }

  const [
    journals,
    checkins,
    patterns,
    themes,
    loops,
    distortions,
    traits,
    behaviourMap,
    socialModel,
    sleepEnergy,
    memorySnapshots,
  ] = await Promise.all([
    listJournalEntries(userId),
    getAllCheckIns(userId),
    getEmotionalPatterns(userId),
    getLifeThemes(userId),
    getBehaviourLoops(userId),
    getCognitiveDistortions(userId),
    getUserTraits(userId),
    loadBehaviourMap(userId),
    loadSocialModel(userId),
    loadSleepEnergyModel(userId),
    listMemorySnapshots(userId, 5),
  ]);

  const payload = {
    journals,
    checkins,
    patterns,
    themes,
    loops,
    distortions,
    traits,
    behaviourMap,
    socialModel,
    sleepEnergy,
    memorySnapshots,
  };

  try {
    const personaInstruction = await buildDeepInsightPersonaInstruction(userId);
    const systemPrompt = `${personaInstruction}
You are Vella's DEEP INSIGHT ENGINE.
Using all provided user data, produce 3–6 profound, high-leverage insights about the user's emotional life, behaviour patterns, and current growth phase.

Each insight must be:
- action-relevant
- psychologically grounded
- compassionate but honest
- focused on what the user can actually influence

Output JSON ONLY in the shape:
{
  "generatedAt": "<ISO>",
  "insights": [
    {
      "id": "<string>",
      "title": "<short title>",
      "summary": "<1-2 sentence overview>",
      "detail": "<3-6 paragraph explanation>",
      "theme": "<short tag>",
      "impactArea": "<emotion|behaviour|relationships|self-concept|habits|purpose>",
      "suggestedFocus": "<what user should focus on next>"
    }
  ]
}`.trim();

    const raw = await runFullAI({
      model: await resolveModelForTier("elite"),
      system: systemPrompt,
      temperature: 0.15,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    const parsed = JSON.parse(raw ?? "{}") as DeepInsightBundle;
    return {
      generatedAt: parsed.generatedAt ?? new Date().toISOString(),
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
    };
  } catch (error) {
    // silent fallback
    return {
      generatedAt: new Date().toISOString(),
      insights: [],
    };
  }
}

async function buildDeepInsightPersonaInstruction(userId: string) {
  const serverSettings = await loadServerPersonaSettings(userId);
  const voiceModel = serverSettings?.voiceModel ?? DEFAULT_VELLA_VOICE_ID;
  const toneStyle = serverSettings?.toneStyle ?? serverSettings?.tone ?? "soft";
  const relationshipMode = serverSettings?.relationshipMode ?? "best_friend";
  const moodState: MoodState = "neutral";
  const delivery = computeDeliveryHints({
    voiceId: voiceModel,
    moodState,
  });

  return await buildPersonaInstruction({
    voiceId: voiceModel,
    moodState,
    delivery,
    relationshipMode,
    userSettings: {
      voiceModel,
      tone: toneStyle,
      toneStyle,
      relationshipMode,
      voiceHud: DEFAULT_VOICE_HUD,
    },
  });
}

