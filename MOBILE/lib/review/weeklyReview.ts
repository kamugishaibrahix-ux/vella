"use server";

import { getUserPlanTier } from "@/lib/tiers/server";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import { getUserTraits, type TraitScores } from "@/lib/traits/adaptiveTraits";
import { listGoals, type UserGoal } from "@/lib/goals/goalEngine";
import { computeTraitDeltas as computeTraitDeltaList, type TraitDelta } from "@/lib/traits/traitDeltas";
import { detectBehaviourLoops } from "@/lib/insights/behaviourLoops";
import { detectCognitiveDistortions } from "@/lib/insights/cognitiveDistortions";
import { extractLifeThemes } from "@/lib/insights/lifeThemes";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";
import { loadLatestDeepInsights } from "@/lib/insights/loadDeepInsights";
import type { DailyCheckIn } from "@/lib/memory/types";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import { loadLocalTraitHistory } from "@/lib/local/traitsLocal";
import { z } from "zod";

export type WeeklyMetricDelta = TraitDelta;

export type WeeklyReview = {
  periodStart: string;
  periodEnd: string;
  highlights: string[];
  challenges: string[];
  traitChanges: WeeklyMetricDelta[];
  emotionalSummary: string;
  behaviourPatterns: string[];
  goalProgress: string[];
  focusForNextWeek: string[];
  deepInsightHighlights?: string[];
};

export type WeeklySignals = {
  periodStart: Date;
  periodEnd: Date;
  traitsNow: TraitScores | null;
  traitsPrev: TraitScores | null;
  checkins: DailyCheckIn[];
  goals: {
    life: UserGoal[];
    focus: UserGoal[];
    weekly: UserGoal[];
  };
  loopsSummary: string[];
  distortionsSummary: string[];
  themesSummary: string[];
};

const VALID_TRAIT_LABELS = [
  "resilience",
  "clarity",
  "discipline",
  "emotional_stability",
  "motivation",
  "self_compassion",
] as const;

const TraitChangeSchema = z.object({
  trait: z.string(),
  delta: z.number(),
  confidence: z.number().min(0).max(1),
});

const WeeklyReviewSchema = z.object({
  traitChanges: z.array(TraitChangeSchema),
  summary: z.string(),
  recommendations: z.array(z.string()),
});

type WeeklyReviewSchemaShape = z.infer<typeof WeeklyReviewSchema>;

const WEEKLY_REVIEW_SCHEMA_FALLBACK: WeeklyReviewSchemaShape = {
  traitChanges: [],
  summary: "",
  recommendations: [],
};

export async function generateWeeklyReview(userId: string): Promise<WeeklyReview> {
  const signals = await collectWeeklySignals(userId);
  const deltas = computeTraitDeltaList(signals.traitsNow, signals.traitsPrev);
  const planTier = await getUserPlanTier(userId);

  let review: WeeklyReview;
  if (planTier === "free") {
    review = await buildRuleBasedReview(signals, deltas);
  } else {
    review = (await buildAIReview(userId, planTier, signals, deltas)) ?? (await buildRuleBasedReview(signals, deltas));
  }

  if (planTier === "elite") {
    const deepBundle = await loadLatestDeepInsights(userId);
    if (deepBundle?.insights?.length) {
      review.deepInsightHighlights = deepBundle.insights
        .map((insight) => insight.title ?? insight.summary ?? insight.id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .slice(0, 2);
    }
  }

  return review;
}

export async function collectWeeklySignals(userId: string): Promise<WeeklySignals> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    traitsNow,
    traitsPrev,
    checkinRows,
    lifeGoals,
    focusGoals,
    weeklyGoals,
    loops,
    distortions,
    themes,
  ] = await Promise.all([
    getUserTraits(userId),
    fetchPreviousTraits(userId, periodStart),
    fetchWeeklyCheckins(userId, periodStart, periodEnd),
    listGoals(userId, "life"),
    listGoals(userId, "focus"),
    listGoals(userId, "weekly"),
    detectBehaviourLoops(userId).catch(() => []),
    detectCognitiveDistortions(userId).catch(() => []),
    extractLifeThemes(userId).catch(() => []),
  ]);

  return {
    periodStart,
    periodEnd,
    traitsNow,
    traitsPrev,
    checkins: checkinRows,
    goals: {
      life: lifeGoals,
      focus: focusGoals,
      weekly: weeklyGoals,
    },
    loopsSummary: loops.map((loop) =>
      loop.frequency ? `${loop.loop} (x${loop.frequency})` : loop.loop,
    ),
    distortionsSummary: distortions.map((dist) => dist.type),
    themesSummary: themes.map((theme) => theme.theme),
  };
}

async function buildAIReview(
  userId: string,
  planTier: PlanTier,
  signals: WeeklySignals,
  deltas: WeeklyMetricDelta[],
): Promise<WeeklyReview | null> {
  try {
    const stats = summarizeCheckins(signals.checkins);
    const payload = {
      type: "weekly_review" as const,
      userId,
      planTier,
      data: {
        periodStart: signals.periodStart.toISOString(),
        periodEnd: signals.periodEnd.toISOString(),
        traitsNow: signals.traitsNow,
        traitsPrev: signals.traitsPrev,
        traitDeltas: deltas,
        checkinsSummary: stats,
        goals: {
          life: signals.goals.life,
          focus: signals.goals.focus,
          weekly: signals.goals.weekly,
        },
        loopsSummary: signals.loopsSummary,
        distortionsSummary: signals.distortionsSummary,
        themesSummary: signals.themesSummary,
      },
    };

    const response = await callVellaReflectionAPI(payload);
    if (response.type === "ai_response") {
      const parsed = parseWeeklyReview(response.message);
      if (parsed) {
        return parsed;
      }
    }
  } catch (error) {
    console.error("[weeklyReview] buildAIReview error", error);
  }
  return null;
}

async function buildRuleBasedReview(
  signals: WeeklySignals,
  deltas: WeeklyMetricDelta[],
): Promise<WeeklyReview> {
  const stats = summarizeCheckins(signals.checkins);
  const highlights: string[] = [];
  const challenges: string[] = [];

  if (signals.checkins.length >= 5) {
    highlights.push("You showed up consistently this week with regular check-ins.");
  } else if (signals.checkins.length >= 1) {
    highlights.push("You checked in a few times—enough to notice patterns starting to emerge.");
  }

  const improvedTraits = deltas.filter((delta) => delta.direction === "up");
  if (improvedTraits.length > 0) {
    highlights.push(
      `Noticed growth in ${improvedTraits
        .map((delta) => delta.label.replace("_", " "))
        .slice(0, 2)
        .join(" & ")}.`,
    );
  }

  const decliningTraits = deltas.filter((delta) => delta.direction === "down");
  if (decliningTraits.length > 0) {
    challenges.push(
      `Energy dipped around ${decliningTraits
        .map((delta) => delta.label.replace("_", " "))
        .slice(0, 2)
        .join(" & ")}.`,
    );
  }

  if (signals.distortionsSummary.length > 3) {
    challenges.push("Thinking patterns felt heavier—try catching one distortion per day.");
  }

  const emotionalSummary = buildEmotionalSummary(stats, signals.loopsSummary);

  const goalProgress = buildGoalProgressSummary(signals.goals);
  const focusForNextWeek = buildFocusSuggestions(deltas, signals.goals);

  return {
    periodStart: signals.periodStart.toISOString(),
    periodEnd: signals.periodEnd.toISOString(),
    highlights: ensureList(highlights, "Keep acknowledging what moved forward, even if small."),
    challenges: ensureList(challenges, "Notice where energy dips so we can support it earlier."),
    traitChanges: deltas,
    emotionalSummary,
    behaviourPatterns: ensureList(
      signals.loopsSummary.slice(0, 4),
      "No major loops stood out this week—stay curious about subtle shifts.",
    ),
    goalProgress,
    focusForNextWeek,
  };
}

function parseWeeklyReview(raw: string | undefined): WeeklyReview | null {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") {
      return buildFallbackWeeklyReview();
    }

    const validation = WeeklyReviewSchema.safeParse(parsed);
    if (!validation.success) {
      console.warn("[weeklyReview] schema validation failed", validation.error.flatten());
    }
    const schemaPayload = validation.success ? validation.data : WEEKLY_REVIEW_SCHEMA_FALLBACK;

    const traitChanges = convertSchemaTraits(schemaPayload.traitChanges);

    const emotionalSummary =
      typeof parsed.emotionalSummary === "string" && parsed.emotionalSummary.length > 0
        ? parsed.emotionalSummary
        : schemaPayload.summary;

    const goalProgress =
      Array.isArray(parsed.goalProgress) && parsed.goalProgress.length > 0
        ? parsed.goalProgress
        : schemaPayload.recommendations.slice(0, 2);

    const focusForNextWeek =
      Array.isArray(parsed.focusForNextWeek) && parsed.focusForNextWeek.length > 0
        ? parsed.focusForNextWeek
        : schemaPayload.recommendations.slice(2);

    const review: WeeklyReview = {
      periodStart: typeof parsed.periodStart === "string" ? parsed.periodStart : new Date().toISOString(),
      periodEnd: typeof parsed.periodEnd === "string" ? parsed.periodEnd : new Date().toISOString(),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      challenges: Array.isArray(parsed.challenges) ? parsed.challenges : [],
      traitChanges,
      emotionalSummary,
      behaviourPatterns: Array.isArray(parsed.behaviourPatterns) ? parsed.behaviourPatterns : [],
      goalProgress,
      focusForNextWeek,
    };

    return review;
  } catch (error) {
    console.error("[weeklyReview] parse error", error);
    return buildFallbackWeeklyReview();
  }
}

function convertSchemaTraits(
  traits: WeeklyReviewSchemaShape["traitChanges"] | undefined,
): WeeklyMetricDelta[] {
  if (!traits?.length) return [];
  const result: WeeklyMetricDelta[] = [];
  for (const item of traits) {
    const parsed = TraitChangeSchema.safeParse(item);
    if (!parsed.success) {
      console.warn("weekly-review: invalid trait entry", item);
      continue;
    }
    const data = parsed.data;
    const label = VALID_TRAIT_LABELS.includes(data.trait as (typeof VALID_TRAIT_LABELS)[number])
      ? (data.trait as WeeklyMetricDelta["label"])
      : "resilience";
    let direction: WeeklyMetricDelta["direction"] = "stable";
    if (data.delta > 0.5) {
      direction = "up";
    } else if (data.delta < -0.5) {
      direction = "down";
    }
    result.push({
      label,
      from: null,
      to: null,
      direction,
    });
  }
  return result;
}

function buildFallbackWeeklyReview(payload?: WeeklyReviewSchemaShape): WeeklyReview {
  const safePayload = payload ?? WEEKLY_REVIEW_SCHEMA_FALLBACK;
  const nowIso = new Date().toISOString();
  const recommendations = safePayload.recommendations ?? [];
  return {
    periodStart: nowIso,
    periodEnd: nowIso,
    highlights: [],
    challenges: [],
    traitChanges: convertSchemaTraits(safePayload.traitChanges ?? []),
    emotionalSummary: safePayload.summary ?? "",
    behaviourPatterns: [],
    goalProgress: recommendations.slice(0, 2),
    focusForNextWeek: recommendations.slice(2),
  };
}

async function fetchWeeklyCheckins(
  userId: string,
  start: Date,
  end: Date,
): Promise<DailyCheckIn[]> {
  const allCheckins = await getAllCheckIns(userId);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  
  const filtered = allCheckins.filter((c) => {
    const createdAt = c.created_at;
    return createdAt >= startIso && createdAt <= endIso;
  });
  
  // Sort by created_at descending (most recent first)
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  
  return sorted.map((row) =>
    mapCheckinRowToDaily({
      id: row.id,
      mood: row.mood,
      energy: row.energy ?? 0,
      stress: row.stress,
      focus: row.focus,
      entry_date: row.entry_date,
      created_at: row.created_at,
      note: row.note ?? null,
    }),
  );
}

async function fetchPreviousTraits(userId: string, before: Date): Promise<TraitScores | null> {
  const history = loadLocalTraitHistory(userId);
  const beforeIso = before.toISOString();
  
  // Filter entries before the specified date, sort by window_end descending (most recent first)
  const filtered = history
    .filter((entry) => entry.windowEnd <= beforeIso)
    .sort((a, b) => new Date(b.windowEnd).getTime() - new Date(a.windowEnd).getTime());
  
  if (filtered.length === 0) return null;
  
  return filtered[0].scores;
}

function mapCheckinRowToDaily(row: CheckinRow): DailyCheckIn {
  return {
    id: row.id,
    date: row.entry_date ?? row.created_at ?? new Date().toISOString(),
    createdAt: row.created_at ?? new Date().toISOString(),
    mood: row.mood ?? 0,
    energy: row.energy ?? 0,
    stress: row.stress ?? 0,
    focus: row.focus ?? 0,
    note: row.note ?? "",
  };
}

function summarizeCheckins(checkins: DailyCheckIn[]) {
  const moods = checkins.map((c) => c.mood);
  const stresses = checkins.map((c) => c.stress);
  const focusValues = checkins.map((c) => c.focus);

  return {
    count: checkins.length,
    avgMood: average(moods),
    avgStress: average(stresses),
    avgFocus: average(focusValues),
  };
}

function buildEmotionalSummary(
  stats: { count: number; avgMood: number | null; avgStress: number | null },
  loopsSummary: string[],
): string {
  const moodLabel = describeAverage(stats.avgMood, {
    low: "tender or low-key",
    medium: "mixed-but-manageable",
    high: "steadier and more hopeful",
  });

  const stressLabel = describeAverage(stats.avgStress, {
    low: "calmer baseline",
    medium: "moderate tension",
    high: "heightened stress",
  });

  const loopNote =
    loopsSummary.length > 0
      ? `A repeating pattern surfaced (${loopsSummary[0].toLowerCase()}).`
      : "No major loops dominated the week.";

  return `Over ${stats.count} check-ins, mood felt ${moodLabel}, while stress held ${stressLabel}. ${loopNote}`;
}

function buildGoalProgressSummary(goals: WeeklySignals["goals"]): string[] {
  const lines: string[] = [];
  if (goals.weekly.length > 0) {
    lines.push(
      `You tracked ${goals.weekly.length} weekly goals—celebrate even tiny check marks you hit.`,
    );
  } else {
    lines.push("No weekly goals were logged; consider defining one small priority for structure.");
  }

  if (goals.focus.length > 0) {
    lines.push(
      `Focus goals (${goals.focus.length}) give you a target; revisit which one needs attention most.`,
    );
  }

  if (goals.life.length > 0) {
    lines.push(
      `Life goals (${goals.life.length}) are still in play—reflect on one step that moved quietly forward.`,
    );
  }

  return lines.slice(0, 4);
}

function buildFocusSuggestions(
  deltas: WeeklyMetricDelta[],
  goals: WeeklySignals["goals"],
): string[] {
  const suggestions: string[] = [];
  const lowestTrait = deltas
    .filter((delta) => typeof delta.to === "number")
    .sort((a, b) => (a.to ?? 0) - (b.to ?? 0))[0];

  if (lowestTrait) {
    suggestions.push(
      `Support your ${lowestTrait.label.replace("_", " ")} by planning one ritual that restores it daily.`,
    );
  }

  if (goals.weekly.length === 0) {
    suggestions.push("Define one small weekly goal so you can feel a clear win by Friday.");
  }

  if (goals.focus.length > 0) {
    suggestions.push("Choose the focus goal that matters most and block 30 minutes for it early in the day.");
  }

  if (suggestions.length < 3) {
    suggestions.push("Schedule a mini self-review next weekend to notice what shifted.");
  }

  return Array.from(new Set(suggestions)).slice(0, 4);
}

function ensureList(list: string[], fallback: string): string[] {
  if (list.length === 0) return [fallback];
  return list;
}

function average(values: number[]): number | null {
  const valid = values.filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (!valid.length) return null;
  const sum = valid.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / valid.length) * 10) / 10;
}

function describeAverage(
  value: number | null,
  labels: { low: string; medium: string; high: string },
): string {
  if (value === null) return "hard to read this week";
  if (value <= 4) return labels.low;
  if (value <= 6) return labels.medium;
  return labels.high;
}

function isDirection(value: any): value is WeeklyMetricDelta["direction"] {
  return ["up", "down", "stable", "unknown"].includes(value);
}

