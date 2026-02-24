"use server";

import { listLocalJournals, type LocalJournalEntry } from "@/lib/local/journalLocal";
import { getEmotionalPatterns } from "@/lib/patterns/getEmotionalPatterns";
import { getLifeThemes } from "@/lib/insights/lifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { listGoals } from "@/lib/goals/goalEngine";
import { generateEmotionalForecast } from "@/lib/forecast/generateEmotionalForecast";
import { buildGrowthRoadmap } from "@/lib/insights/growthRoadmap";
import { generateRegulationStrategies } from "@/lib/regulation/generateRegulationStrategies";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import type { EmotionalPatternSummary } from "@/lib/insights/patterns";

type GoalSummary = {
  life: Awaited<ReturnType<typeof listGoals>>;
  focus: Awaited<ReturnType<typeof listGoals>>;
};

type JournalRow = LocalJournalEntry;

export type DailyContext = {
  checkins: CheckinRow[];
  journals: JournalRow[];
  patterns: Awaited<ReturnType<typeof getEmotionalPatterns>> | null;
  themes: Awaited<ReturnType<typeof getLifeThemes>>;
  loops: Awaited<ReturnType<typeof getBehaviourLoops>>;
  distortions: Awaited<ReturnType<typeof getCognitiveDistortions>>;
  traits: Awaited<ReturnType<typeof getUserTraits>>;
  goals: GoalSummary;
  forecast: Awaited<ReturnType<typeof generateEmotionalForecast>>;
  growth: Awaited<ReturnType<typeof buildGrowthRoadmap>> | null;
  strategies: Awaited<ReturnType<typeof generateRegulationStrategies>>;
};

export async function buildDailyContext(userId: string): Promise<DailyContext> {
  const [checkins, journals, patterns, themes, loops, distortions, traits, goals, forecast, growth] =
    await Promise.all([
      fetchRecentCheckins(userId),
      fetchRecentJournals(userId),
      safeCall(() => getEmotionalPatterns(userId), EMPTY_PATTERN_SUMMARY),
      safeCall(() => getLifeThemes(userId), []),
      safeCall(() => getBehaviourLoops(userId), []),
      safeCall(() => getCognitiveDistortions(userId), []),
      safeCall(() => getUserTraits(userId), null),
      safeCall(
        async () => ({
          life: await listGoals(userId, "life"),
          focus: await listGoals(userId, "focus"),
        }),
        { life: [], focus: [] },
      ),
      safeCall(() => generateEmotionalForecast(userId), null),
      safeCall(() => buildGrowthRoadmap(userId), null),
    ]);

  const strategies = await safeCall(
    () =>
      generateRegulationStrategies({
        patterns,
        loops,
        distortions,
        traits,
        themes,
        goals,
      }),
    [],
  );

  return {
    checkins,
    journals,
    patterns,
    themes,
    loops,
    distortions,
    traits,
    goals,
    forecast,
    growth,
    strategies,
  };
}

const EMPTY_PATTERN_SUMMARY: EmotionalPatternSummary = {
  patterns: {
    commonPrimaryEmotions: [],
    commonTriggers: [],
    commonFears: [],
    emotionalTendencies: [],
  },
  planTier: "free",
};

async function fetchRecentCheckins(userId: string, limit = 7): Promise<CheckinRow[]> {
  try {
    const allCheckins = await getAllCheckIns(userId);
    // Sort by created_at descending (most recent first) and limit
    const sorted = [...allCheckins]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
    
    return sorted.map((c) => ({
      id: c.id,
      entry_date: c.entry_date,
      created_at: c.created_at,
      mood: c.mood,
      stress: c.stress,
      energy: c.energy ?? 0,
      focus: c.focus,
      note: c.note ?? null,
    }));
  } catch (error) {
    console.error("[buildDailyContext] fetchRecentCheckins error", error);
    return [];
  }
}

async function fetchRecentJournals(userId: string, limit = 5): Promise<JournalRow[]> {
  const all = listLocalJournals(userId);
  // Sort by createdAt descending (most recent first) and limit
  return all
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

async function safeCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error("[buildDailyContext] safeCall error", error);
    return fallback;
  }
}

