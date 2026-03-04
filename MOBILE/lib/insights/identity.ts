"use server";

import { getUserPlanTier } from "@/lib/tiers/server";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";
import { detectBehaviourLoops } from "@/lib/insights/behaviourLoops";
import { extractLifeThemes } from "@/lib/insights/lifeThemes";
import { generateEmotionalPatterns } from "@/lib/insights/patterns";
import { detectCognitiveDistortions } from "@/lib/insights/cognitiveDistortions";
import { getUserTraits, type TraitScores } from "@/lib/traits/adaptiveTraits";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";
import { z } from "zod";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

type JournalRow = LocalJournalEntry;

export type IdentityInsight = {
  name: string;
  description: string;
  fallback?: boolean;
  mode?: "ai" | "lite";
};

export type StrengthsValuesResult = {
  strengths: IdentityInsight[];
  values: IdentityInsight[];
  traits?: TraitScores | null;
  fallback?: boolean;
  mode?: "ai" | "lite";
};

const identitySchema = z.object({
  strengths: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
  values: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
});

export async function extractStrengthsAndValues(userId: string | null): Promise<StrengthsValuesResult> {
  if (!userId) {
    const emptyResult = heuristicIdentity([], []);
    return { ...emptyResult, traits: null, fallback: true, mode: "lite" };
  }

  const [planTier, journals, checkins, loops, lifeThemes, distortions, traits, personaSettings] =
    await Promise.all([
      getUserPlanTier(userId),
      fetchJournals(userId),
      fetchCheckins(userId),
      detectBehaviourLoops(userId),
      extractLifeThemes(userId),
      detectCognitiveDistortions(userId),
      getUserTraits(userId),
      loadServerPersonaSettings(userId),
    ]);

  const _ent = getDefaultEntitlements(planTier);
  if (!_ent.enableDeepDive) {
    const result = heuristicIdentity(journals, checkins);
    return { ...result, traits: traits ?? null, fallback: true, mode: "lite" };
  }

  const patternSnapshot = await generateEmotionalPatterns(
    userId,
    personaSettings?.language ?? "en",
    personaSettings,
  );

  const payload = {
    type: "strengths_values" as const,
    data: {
      journals,
      checkins,
      loops,
      lifeThemes,
      patterns: patternSnapshot.patterns,
      distortions,
      traits,
      nudgesEnabled: true,
    },
    planTier,
    userId,
  };

  const response = await callVellaReflectionAPI(payload);
  if (response.type === "ai_response") {
    const parsed = parseIdentityResponse(response.message);
    if (parsed.strengths.length > 0 || parsed.values.length > 0) {
      return { ...parsed, traits: traits ?? null, fallback: false, mode: "ai" };
    }
  }

  const fallback = heuristicIdentity(journals, checkins);
  return { ...fallback, traits: traits ?? null, fallback: true, mode: "lite" };
}

import { listLocalJournals } from "@/lib/local/journalLocal";

async function fetchJournals(userId: string): Promise<JournalRow[]> {
  try {
    const journals = listLocalJournals(userId);
    // PHASE 11: Filter out corrupt journal entries
    const validJournals = journals.filter((j) => {
      if (!j.id || typeof j.id !== 'string') return false;
      if (!j.content || typeof j.content !== 'string') return false;
      return true;
    });
    return validJournals.slice(0, 20);
  } catch (error) {
    // silent fallback
    return [];
  }
}

async function fetchCheckins(userId: string): Promise<CheckinRow[]> {
  try {
    const allCheckins = await getAllCheckIns(userId);
    // PHASE 11: Filter out entries with invalid dates before sorting
    const validCheckins = allCheckins.filter((c) => {
      if (!c.created_at) return false;
      const date = new Date(c.created_at);
      return !isNaN(date.getTime());
    });
    
    // Sort by created_at descending (most recent first) and limit to 30
    const sorted = [...validCheckins]
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      })
      .slice(0, 30);
    
    return sorted.map((c) => ({
      id: c.id,
      mood: typeof c.mood === 'number' && !isNaN(c.mood) ? c.mood : 0,
      stress: typeof c.stress === 'number' && !isNaN(c.stress) ? c.stress : 0,
      energy: typeof c.energy === 'number' && !isNaN(c.energy) ? (c.energy ?? 0) : 0,
      focus: typeof c.focus === 'number' && !isNaN(c.focus) ? c.focus : 0,
      entry_date: c.entry_date,
      created_at: c.created_at,
      note: c.note ?? null,
    })) as CheckinRow[];
  } catch (error) {
    // silent fallback
    return [];
  }
}

function heuristicIdentity(
  journals: JournalRow[],
  checkins: CheckinRow[],
): Pick<StrengthsValuesResult, "strengths" | "values"> {
  const combined = (
    journals.map((j) => j.content ?? "").join(" ") +
    " " +
    checkins.map((c) => c.note ?? "").join(" ")
  ).toLowerCase();

  const strengths: IdentityInsight[] = [];
  const values: IdentityInsight[] = [];

  if (/i (kept ?going|pushed through|tried my best|showed up)/.test(combined)) {
    strengths.push({
      name: "Resilience",
      description: "You keep showing up and trying, even when days feel heavy.",
    });
  }

  if (/(i care about|i value|it matters to me)/.test(combined)) {
    strengths.push({
      name: "Empathy",
      description: "You care deeply about the people and causes around you.",
    });
  }

  if (/(routine|habit|consistent|steady)/.test(combined)) {
    strengths.push({
      name: "Consistency",
      description: "You build steady routines even when motivation wobbles.",
    });
  }

  if (/(connect|community|relationship|family|friends)/.test(combined)) {
    values.push({
      name: "Connection",
      description: "Being close to people and feeling understood matters a lot to you.",
    });
  }

  if (/(learn|grow|improve|evolve|progress)/.test(combined)) {
    values.push({
      name: "Growth",
      description: "You’re committed to learning from your experiences and evolving.",
    });
  }

  if (/(calm|steady|balance|stability|security)/.test(combined)) {
    values.push({
      name: "Stability",
      description: "Feeling grounded and having a sense of control helps you thrive.",
    });
  }

  if (strengths.length === 0) {
    strengths.push({
      name: "Quiet resilience",
      description: "You keep moving forward quietly, even if you don’t give yourself credit yet.",
    });
  }

  if (values.length === 0) {
    values.push({
      name: "Authenticity",
      description: "You want life to feel honest and aligned with who you are inside.",
    });
  }

  return {
    strengths: strengths.map((entry) => ({
      ...entry,
      fallback: true,
      mode: "lite",
    })),
    values: values.map((entry) => ({
      ...entry,
      fallback: true,
      mode: "lite",
    })),
  };
}

function parseIdentityResponse(raw: string | undefined): StrengthsValuesResult {
  if (!raw) {
    const emptyResult = heuristicIdentity([], []);
    return { ...emptyResult, traits: null, fallback: true, mode: "lite" };
  }
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const validation = identitySchema.safeParse(parsed);
    if (!validation.success) {
      // silent fallback
      const emptyResult = heuristicIdentity([], []);
      return { ...emptyResult, traits: null, fallback: true, mode: "lite" };
    }
    const mapInsights = (items: { name: string; description: string }[]): IdentityInsight[] =>
      items.slice(0, 5).map((item) => ({
        name: item.name,
        description: item.description,
        fallback: false,
        mode: "ai",
      }));
    return {
      strengths: mapInsights(validation.data.strengths),
      values: mapInsights(validation.data.values),
      traits: null,
      fallback: false,
      mode: "ai",
    };
  } catch (error) {
    // silent fallback
    const emptyResult = heuristicIdentity([], []);
    return { ...emptyResult, traits: null, fallback: true, mode: "lite" };
  }
}

