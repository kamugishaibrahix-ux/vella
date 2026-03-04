"use server";

import { getUserPlanTier } from "@/lib/tiers/server";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import { generateEmotionalPatterns } from "@/lib/insights/patterns";
import { analyseJournalEntries } from "@/lib/insights/journalAnalysis";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

export type ForecastSnapshot = {
  mood: number;
  energy: number;
  stress: number;
  confidence: number;
};

export type MoodForecast = {
  shortTerm: ForecastSnapshot;
  weekTrend: "rising" | "stable" | "dipping";
};

const DEFAULT_FORECAST: MoodForecast = {
  shortTerm: { mood: 5, energy: 5, stress: 5, confidence: 0.4 },
  weekTrend: "stable",
};

export async function forecastMood(userId: string | null): Promise<MoodForecast> {
  if (!userId) return DEFAULT_FORECAST;

  const [planTier, checkins] = await Promise.all([
    getUserPlanTier(userId),
    fetchCheckins(userId),
  ]);

  if (checkins.length === 0) {
    return DEFAULT_FORECAST;
  }

  const _ent = getDefaultEntitlements(planTier);
  if (!_ent.enableDeepDive) {
    return heuristicForecast(checkins);
  }

  const personaSettings = await loadServerPersonaSettings(userId);
  const personaLanguage = personaSettings?.language ?? "en";
  const [patternSnapshot, journalThemes] = await Promise.all([
    generateEmotionalPatterns(userId, personaLanguage, personaSettings),
    analyseJournalEntries(userId),
  ]);

  const payload = {
    type: "forecast" as const,
    checkins: checkins.slice(0, 60),
    patterns: patternSnapshot.patterns,
    journalThemes,
    planTier,
    userId,
  };

  const response = await callVellaReflectionAPI(payload);
  if (response.type === "ai_response") {
    const parsed = parseForecast(response.message);
    if (parsed) return parsed;
  }

  return heuristicForecast(checkins);
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
    
  // Sort by created_at descending (most recent first) and limit to 60
    const sorted = [...validCheckins]
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      })
    .slice(0, 60);
  
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

function heuristicForecast(entries: CheckinRow[]): MoodForecast {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at ?? a.entry_date ?? "").getTime() - new Date(b.created_at ?? b.entry_date ?? "").getTime(),
  );
  const recent = sorted.slice(-6);
  const earlier = sorted.slice(-12, -6);

  const shortTermMood = average(recent.map((c) => c.mood ?? 5));
  const shortTermEnergy = average(recent.map((c) => c.energy ?? 5));
  const shortTermStress = average(recent.map((c) => c.stress ?? 5));
  const moodDelta = shortTermMood - average(earlier.map((c) => c.mood ?? shortTermMood));

  let weekTrend: MoodForecast["weekTrend"] = "stable";
  if (moodDelta >= 0.5) weekTrend = "rising";
  else if (moodDelta <= -0.5) weekTrend = "dipping";

  const confidence = Math.min(0.9, entries.length / 60 + 0.3);

  return {
    shortTerm: {
      mood: roundTo(shortTermMood, 1),
      energy: roundTo(shortTermEnergy, 1),
      stress: roundTo(shortTermStress, 1),
      confidence: roundTo(confidence, 2),
    },
    weekTrend,
  };
}

function parseForecast(raw: string | undefined): MoodForecast | null {
  if (!raw) return null;
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      parsed.shortTerm &&
      typeof parsed.shortTerm.mood === "number" &&
      typeof parsed.weekTrend === "string"
    ) {
      return {
        shortTerm: {
          mood: clamp(parsed.shortTerm.mood, 0, 10),
          energy: clamp(parsed.shortTerm.energy ?? 5, 0, 10),
          stress: clamp(parsed.shortTerm.stress ?? 5, 0, 10),
          confidence: clamp(parsed.shortTerm.confidence ?? 0.5, 0, 1),
        },
        weekTrend: ["rising", "stable", "dipping"].includes(parsed.weekTrend)
          ? parsed.weekTrend
          : "stable",
      };
    }
  } catch (error) {
    // silent fallback
  }
  return null;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundTo(value: number, precision: number) {
  const base = Math.pow(10, precision);
  return Math.round(value * base) / base;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

