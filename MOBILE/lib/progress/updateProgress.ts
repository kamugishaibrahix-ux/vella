"use server";

import { serverLocalSet } from "@/lib/local/serverLocal";
import { getRecentCheckIns } from "@/lib/memory/localMemory";
import { listJournalEntries } from "@/lib/journal/server";
import { getEmotionalPatterns } from "@/lib/patterns/getEmotionalPatterns";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { listGoals } from "@/lib/goals/goalEngine";

type ProgressPayload = {
  journalStreak: number;
  checkInStreak: number;
  moodTrend: "improving" | "stable" | "declining";
  stressTrend: "improving" | "stable" | "declining";
  consistencyScore: number;
  progressScore: number;
  growthSignals: string[];
  overload?: number;
};

export async function updateProgress(
  userId: string | null,
  extra?: { overload?: number },
): Promise<ProgressPayload | null> {
  if (!userId) return null;

  try {
    const [checkins, journals, patternSummary, loops, distortions, traits, lifeGoals, focusGoals] =
      await Promise.all([
        getRecentCheckIns(14),
        listJournalEntries(userId, 20),
        getEmotionalPatterns(userId),
        getBehaviourLoops(userId),
        getCognitiveDistortions(userId),
        getUserTraits(userId),
        listGoals(userId, "life"),
        listGoals(userId, "focus"),
      ]);

    const journalStreak = computeJournalStreak(journals);
    const checkInStreak = computeCheckinStreak(checkins);
    const moodTrend = computeTrend(checkins.map((c) => c.mood ?? 5));
    const stressTrend = computeTrend(checkins.map((c) => (c.stress ? 10 - c.stress : 5)));
    const consistencyScore = computeConsistencyScore(journalStreak, checkInStreak);
    const progressScore = computeProgressScore({
      consistencyScore,
      moodTrend,
      stressTrend,
      loops,
      distortions,
    });
    const summaryPatterns =
      patternSummary?.patterns ?? {
        commonPrimaryEmotions: [],
        commonTriggers: [],
        commonFears: [],
        emotionalTendencies: [],
      };
    const patternLabels = [
      ...summaryPatterns.commonPrimaryEmotions,
      ...summaryPatterns.commonTriggers,
      ...summaryPatterns.commonFears,
      ...summaryPatterns.emotionalTendencies,
    ];

    const growthSignals = buildGrowthSignals({
      journalStreak,
      checkInStreak,
      patterns: patternLabels,
      loops,
      distortions,
      traits,
      goalsCount: (lifeGoals?.length ?? 0) + (focusGoals?.length ?? 0),
    });

    const payload: ProgressPayload = {
      journalStreak,
      checkInStreak,
      moodTrend,
      stressTrend,
      consistencyScore,
      progressScore,
      growthSignals,
      overload: extra?.overload ?? undefined,
    };

    try {
      await serverLocalSet(`progress_metrics:${userId}`, {
        user_id: userId,
        data: payload,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.warn("[progress] updateProgress error", error);
    }
    return payload;
  } catch (error) {
    console.warn("[progress] updateProgress error", error);
    return null;
  }
}

function computeJournalStreak(entries: { createdAt?: string | null }[]): number {
  return Math.min(14, entries.length);
}

function computeCheckinStreak(checkins: { createdAt?: string; created_at?: string }[]): number {
  return Math.min(14, checkins.length);
}

function computeTrend(values: number[]): "improving" | "stable" | "declining" {
  if (values.length < 4) return "stable";
  const half = Math.floor(values.length / 2);
  const early = average(values.slice(0, half));
  const late = average(values.slice(half));
  if (late >= early + 0.6) return "improving";
  if (late <= early - 0.6) return "declining";
  return "stable";
}

function computeConsistencyScore(journalStreak: number, checkInStreak: number): number {
  return Math.min(1, (journalStreak * 0.05 + checkInStreak * 0.05) / 2);
}

function computeProgressScore(params: {
  consistencyScore: number;
  moodTrend: string;
  stressTrend: string;
  loops: unknown[];
  distortions: unknown[];
}): number {
  let score = params.consistencyScore;
  if (params.moodTrend === "improving") score += 0.2;
  if (params.stressTrend === "improving") score += 0.2;
  if ((params.loops ?? []).length <= 2) score += 0.1;
  if ((params.distortions ?? []).length <= 2) score += 0.1;
  return Math.max(0, Math.min(1, score));
}

function buildGrowthSignals(args: {
  journalStreak: number;
  checkInStreak: number;
  patterns: string[];
  loops: unknown[];
  distortions: unknown[];
  traits: unknown;
  goalsCount: number;
}): string[] {
  const signals: string[] = [];
  if (args.journalStreak >= 3) signals.push("Consistent journaling momentum.");
  if (args.checkInStreak >= 5) signals.push("Daily self-awareness ritual forming.");
  if (args.patterns.some((p) => p.toLowerCase().includes("gratitude"))) {
    signals.push("Gratitude themes rising.");
  }
  if ((args.loops ?? []).length <= 1) {
    signals.push("Behaviour loops stabilising.");
  }
  if (args.distortions.length <= 1) {
    signals.push("Clearer thinking emerging.");
  }
  if (args.goalsCount >= 1) {
    signals.push("Active goals guiding direction.");
  }
  return signals;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

