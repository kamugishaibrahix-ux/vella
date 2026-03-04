"use server";

// TODO[privacy]: This module still reads Supabase journal/checkin content.
// Once the local-only insight engine is wired, switch the data source
// to lib/local/localJournals and lib/local/localCheckins.

import { getUserPlanTier } from "@/lib/tiers/server";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import { extractLifeThemes, type LifeTheme } from "@/lib/insights/lifeThemes";
import { detectBehaviourLoops, type BehaviourLoop } from "@/lib/insights/behaviourLoops";
import {
  extractStrengthsAndValues,
  type StrengthsValuesResult,
} from "@/lib/insights/identity";
import {
  detectCognitiveDistortions,
  type CognitiveDistortion,
} from "@/lib/insights/cognitiveDistortions";
import { generateEmotionalPatterns } from "@/lib/insights/patterns";
import { getUserTraits, type TraitScores } from "@/lib/traits/adaptiveTraits";
import { listGoals, type UserGoal } from "@/lib/goals/goalEngine";
import { collectWeeklySignals, type WeeklySignals } from "@/lib/review/weeklyReview";
import {
  generateEmotionalForecast,
  type EmotionalForecast,
} from "@/lib/forecast/generateEmotionalForecast";
import type { MemoryProfile } from "@/lib/memory/types";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import type { MonitoringSnapshot } from "@/lib/monitor/types";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import type { InsightCardData } from "@/lib/insights/types";
import type { DailyCheckIn } from "@/lib/memory/types";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import type { UILanguageCode } from "@/i18n/types";
import { z } from "zod";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

type JournalRow = LocalJournalEntry;

export type GrowthRoadmap = {
  shortTerm: string[];
  midTerm: string[];
  longTerm: string[];
  traits?: TraitScores | null;
};

export type GrowthRoadmapResult = {
  roadmap: GrowthRoadmap;
  fallback: boolean;
  error?: string | null;
};

type RoadmapPersona = {
  voiceModel?: string | null;
  toneStyle?: string | null;
  relationshipMode?: MemoryProfile["relationshipMode"] | null;
  language?: SupportedLanguage | null;
  behaviourVector?: BehaviourVector | null;
  monitoring?: MonitoringSnapshot | null;
};

const EMPTY_ROADMAP: GrowthRoadmap = {
  shortTerm: [],
  midTerm: [],
  longTerm: [],
  traits: null,
};

const roadmapJsonSchema = z.object({
  shortTerm: z.array(z.string()),
  midTerm: z.array(z.string()),
  longTerm: z.array(z.string()),
});

export async function buildGrowthRoadmap(
  userId: string | null,
  options?: { persona?: RoadmapPersona | null; locale?: UILanguageCode },
): Promise<GrowthRoadmap> {
  const result = await buildGrowthRoadmapDetailed(userId, options);
  return result.roadmap;
}

export async function buildGrowthRoadmapDetailed(
  userId: string | null,
  options?: { persona?: RoadmapPersona | null; locale?: UILanguageCode },
): Promise<GrowthRoadmapResult> {
  if (!userId) {
    return { roadmap: EMPTY_ROADMAP, fallback: true, error: "missing_user" };
  }

  const [
    lifeThemes,
    loops,
    strengthsValues,
    distortions,
    traits,
    lifeGoals,
    focusGoals,
    weeklyGoals,
    forecast,
    weeklySignals,
    personaSettings,
  ] = await Promise.all([
    extractLifeThemes(userId),
    detectBehaviourLoops(userId),
    extractStrengthsAndValues(userId),
    detectCognitiveDistortions(userId),
    getUserTraits(userId),
    listGoals(userId, "life"),
    listGoals(userId, "focus"),
    listGoals(userId, "weekly"),
    generateEmotionalForecast(userId),
    collectWeeklySignals(userId),
    loadServerPersonaSettings(userId),
  ]);

  const liteRoadmap = buildLiteRoadmap({
    lifeThemes,
    loops,
    strengthsValues,
    distortions,
    traits,
    goals: {
      life: lifeGoals,
      focus: focusGoals,
      weekly: weeklyGoals,
    },
  });

  try {
    const roadmap = await generateGrowthRoadmap({
      userId,
      traits,
      strengthsValues,
      themes: lifeThemes,
      loops,
      distortions,
      goals: {
        life: lifeGoals,
        focus: focusGoals,
        weekly: weeklyGoals,
      },
      forecast,
      weeklySignals,
      persona: options?.persona ?? null,
      personaSettings,
      throwOnFailure: true,
      locale: options?.locale,
    });

    return { roadmap, fallback: false };
  } catch (error) {
    // silent fallback
    return {
      roadmap: liteRoadmap,
      fallback: true,
      error: error instanceof Error ? error.message : "roadmap_generation_failed",
    };
  }
}

type GrowthRoadmapInput = {
  userId: string;
  traits: TraitScores | null;
  strengthsValues: StrengthsValuesResult | null;
  themes: LifeTheme[];
  loops: BehaviourLoop[];
  distortions: CognitiveDistortion[];
  goals: {
    life: UserGoal[];
    focus: UserGoal[];
    weekly: UserGoal[];
  };
  forecast: EmotionalForecast | null;
  weeklySignals: WeeklySignals | null;
  persona: RoadmapPersona | null;
  personaSettings: Awaited<ReturnType<typeof loadServerPersonaSettings>> | null;
  throwOnFailure?: boolean;
  locale?: UILanguageCode;
};

export async function generateGrowthRoadmap(input: GrowthRoadmapInput): Promise<GrowthRoadmap> {
  const planTier = await getUserPlanTier(input.userId);
  const personaLanguage =
    input.persona?.language ?? input.personaSettings?.language ?? undefined;

  const [patternSnapshot, journals, checkins] = await Promise.all([
    generateEmotionalPatterns(input.userId, personaLanguage, input.personaSettings ?? null),
    fetchJournals(input.userId),
    fetchCheckins(input.userId),
  ]);

  const liteRoadmap = buildLiteRoadmap({
    lifeThemes: input.themes,
    loops: input.loops,
    strengthsValues: input.strengthsValues,
    distortions: input.distortions,
    traits: input.traits,
    goals: input.goals,
  });

  const _ent = getDefaultEntitlements(planTier);
  if (!_ent.enableGrowthRoadmap) {
    return liteRoadmap;
  }

  try {
    const structuredCheckins = checkins.map(mapRowToDaily);
    const personaOverrides = resolvePersonaOverrides(input.persona, input.personaSettings);
    const roadmapInsights = await fetchRoadmapInsights({
      userId: input.userId,
      planTier,
      checkins: structuredCheckins,
      patterns: buildContextPatterns(input, flattenPatternStrings(patternSnapshot.patterns)),
      persona: personaOverrides,
    });

    if (!roadmapInsights.length) {
      return liteRoadmap;
    }

    const roadmap = mapInsightsToRoadmap(roadmapInsights);
    return {
      shortTerm: mergeUnique([...roadmap.shortTerm, ...liteRoadmap.shortTerm]).slice(0, 3),
      midTerm: mergeUnique([...roadmap.midTerm, ...liteRoadmap.midTerm]).slice(0, 3),
      longTerm: mergeUnique([...roadmap.longTerm, ...liteRoadmap.longTerm]).slice(0, 3),
      traits: input.traits ?? null,
    };
  } catch (error) {
    // silent fallback
    if (input.throwOnFailure) {
      throw error;
    }
    return liteRoadmap;
  }
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
    return validJournals.slice(0, 10);
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
    
    // Sort by created_at descending (most recent first) and limit to 15
    const sorted = [...validCheckins]
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      })
      .slice(0, 15);
    
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

function buildLiteRoadmap(params: {
  lifeThemes: { theme: string; description: string }[];
  loops: { loop: string; description: string; frequency: number }[];
  strengthsValues: { strengths: { name: string; description: string }[]; values: { name: string; description: string }[] } | null;
  distortions: { type: string; explanation: string; examples: string[] }[];
  traits?: TraitScores | null;
  goals?: {
    life: UserGoal[];
    focus: UserGoal[];
    weekly: UserGoal[];
  };
}): GrowthRoadmap {
  const { lifeThemes, loops, strengthsValues, distortions, traits, goals } = params;
  const normalizedStrengths =
    strengthsValues ?? { strengths: [], values: [] };
  const shortTerm: string[] = [];
  const midTerm: string[] = [];
  const longTerm: string[] = [];

  if (normalizedStrengths.values.length > 0) {
    shortTerm.push(
      `Plan one action this week that honours ${normalizedStrengths.values[0].name.toLowerCase()} (e.g. ${normalizedStrengths.values[0].description.toLowerCase()}).`,
    );
  }
  if (loops.length > 0) {
    shortTerm.push(
      `Break the ${loops[0].loop.toLowerCase()} loop with a five-minute micro-step today.`,
    );
  }

  if (lifeThemes.length > 0) {
    midTerm.push(
      `Design a weekly ritual that supports your “${lifeThemes[0].theme.toLowerCase()}” theme.`,
    );
  }
  if (distortions.length > 0) {
    midTerm.push(
      `Practice catching ${distortions[0].type.toLowerCase()} once per week and rewrite the thought.`,
    );
  }

  if (normalizedStrengths.strengths.length > 0) {
    longTerm.push(
      `Build a 60-day project that leans on your ${normalizedStrengths.strengths[0].name.toLowerCase()}.`,
    );
  }
  if (lifeThemes.length > 1) {
    longTerm.push(
      `Align a bigger goal with your "${lifeThemes[1].theme.toLowerCase()}" theme over the next few months.`,
    );
  } else {
    longTerm.push("Review progress every month and adjust your routines to stay aligned with your values.");
  }

  if (goals) {
    if (goals.weekly.length > 0) {
      goals.weekly.slice(0, 2).forEach((goal) => {
        shortTerm.push(`Give "${goal.title}" a focused block this week to keep momentum.`);
      });
    } else {
      shortTerm.push("Define 1–3 weekly goals to anchor your attention.");
    }

    if (goals.focus.length === 0) {
      midTerm.push("Set a clear 30-day focus goal so your energy has a target.");
    }

    if (goals.life.length > 0) {
      longTerm.push(`Review progress on "${goals.life[0].title}" every month.`);
    }
  }

  if (traits) {
    if (traits.discipline < 45) {
      shortTerm.push("Use a two-minute activation ritual to start any task that feels heavy today.");
    }
    if (traits.resilience < 50) {
      midTerm.push("Schedule recovery pockets after emotionally demanding events to rebuild resilience.");
    }
    if (traits.motivation < 50) {
      shortTerm.push("Pair every must-do action with a small celebration to keep motivation steady.");
    }
    if (traits.emotional_stability < 50) {
      midTerm.push("Anchor each evening with a grounding reflection to steady your nervous system.");
    }
    if (traits.self_compassion < 45) {
      longTerm.push("Practice one self-compassion reframe per week to soften old inner narratives.");
    }
  }

  const trimmedShort = Array.from(new Set(shortTerm)).slice(0, 3);
  const trimmedMid = Array.from(new Set(midTerm)).slice(0, 3);
  const trimmedLong = Array.from(new Set(longTerm)).slice(0, 3);

  return {
    shortTerm: trimmedShort,
    midTerm: trimmedMid,
    longTerm: trimmedLong,
    traits: traits ?? null,
  };
}

function parseRoadmap(raw: string | undefined): GrowthRoadmap | null {
  if (!raw) return null;
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const validation = roadmapJsonSchema.safeParse(parsed);
    if (!validation.success) {
      // silent fallback
      return null;
    }
    const { shortTerm, midTerm, longTerm } = validation.data;
    return {
      shortTerm: shortTerm.slice(0, 5),
      midTerm: midTerm.slice(0, 5),
      longTerm: longTerm.slice(0, 5),
    };
  } catch (error) {
    // silent fallback
  }
  return null;
}

function buildContextPatterns(
  input: GrowthRoadmapInput,
  patternStrings: string[],
): MemoryProfile["emotionalPatterns"] {
  const emotionalTendencies: string[] = [];
  patternStrings.forEach((line) => emotionalTendencies.push(line));
  input.themes.slice(0, 3).forEach((theme) =>
    emotionalTendencies.push(`${theme.theme}: ${theme.description}`),
  );
  input.loops.slice(0, 3).forEach((loop) =>
    emotionalTendencies.push(`${loop.loop}: ${loop.description}`),
  );
  return {
    commonPrimaryEmotions: [],
    commonTriggers: [],
    commonFears: [],
    emotionalTendencies: emotionalTendencies.slice(0, 5),
  };
}

function flattenPatternStrings(patterns: MemoryProfile["emotionalPatterns"]): string[] {
  return [
    ...(patterns.commonPrimaryEmotions ?? []),
    ...(patterns.commonTriggers ?? []),
    ...(patterns.commonFears ?? []),
    ...(patterns.emotionalTendencies ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function resolvePersonaOverrides(
  overrides: RoadmapPersona | null,
  fallback: Awaited<ReturnType<typeof loadServerPersonaSettings>> | null,
): RoadmapPersona {
  return {
    voiceModel: overrides?.voiceModel ?? fallback?.voiceModel ?? null,
    toneStyle: overrides?.toneStyle ?? fallback?.toneStyle ?? fallback?.tone ?? null,
    relationshipMode: overrides?.relationshipMode ?? fallback?.relationshipMode ?? null,
    language: overrides?.language ?? null,
    behaviourVector: overrides?.behaviourVector ?? null,
    monitoring: overrides?.monitoring ?? null,
  };
}

type RoadmapInsightRequest = {
  userId: string;
  planTier: PlanTier;
  checkins: DailyCheckIn[];
  patterns?: MemoryProfile["emotionalPatterns"];
  persona: RoadmapPersona;
};

async function fetchRoadmapInsights(request: RoadmapInsightRequest): Promise<InsightCardData[]> {
  const response = await fetch(`${getBaseUrl()}/api/insights/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: request.userId,
      planTier: request.planTier,
      checkins: request.checkins,
      patterns: request.patterns,
      voiceModel: request.persona.voiceModel,
      toneStyle: request.persona.toneStyle,
      relationshipMode: request.persona.relationshipMode,
      language: request.persona.language,
      behaviourVector: request.persona.behaviourVector,
      monitoring: request.persona.monitoring,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("insight_generate_failed");
  }
  const data = (await response.json()) as { insights?: InsightCardData[] };
  return data.insights ?? [];
}

function mapInsightsToRoadmap(insights: InsightCardData[]) {
  const shortTerm: string[] = [];
  const midTerm: string[] = [];
  const longTerm: string[] = [];

  insights.forEach((insight) => {
    const text = insight.action ?? insight.body;
    if (!text) return;
    if ((insight.kind === "today" || insight.kind === "lite") && shortTerm.length < 3) {
      shortTerm.push(text);
      return;
    }
    if (insight.kind === "pattern" && midTerm.length < 3) {
      midTerm.push(text);
      return;
    }
    if (longTerm.length < 3) {
      longTerm.push(text);
    }
  });

  return {
    shortTerm,
    midTerm,
    longTerm,
  };
}

function mapRowToDaily(row: CheckinRow): DailyCheckIn {
  const date = row.entry_date ?? row.created_at ?? new Date().toISOString();
  return {
    id: row.id ? String(row.id) : date,
    date: date.slice(0, 10),
    createdAt: row.created_at ?? date,
    mood: row.mood ?? 0,
    stress: row.stress ?? 0,
    energy: row.energy ?? 0,
    focus: row.focus ?? 0,
    note: row.note ?? "",
  };
}

function mergeUnique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

