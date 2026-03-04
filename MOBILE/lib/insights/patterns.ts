"use server";

import type { PlanTier } from "@/lib/tiers/tierCheck";
import { getUserPlanTier } from "@/lib/tiers/server";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import type { ServerPersonaSettings } from "@/lib/ai/personaServer";
import type { MemoryProfile, DailyCheckIn } from "@/lib/memory/types";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

type JournalRow = LocalJournalEntry;

export type EmotionalPatternSummary = {
  patterns: MemoryProfile["emotionalPatterns"];
  planTier: PlanTier;
};

export async function generateEmotionalPatterns(
  userId: string,
  preferredLanguage?: string,
  personaSettingsOverride?: ServerPersonaSettings | null,
): Promise<EmotionalPatternSummary> {
  const personaSettingsPromise = personaSettingsOverride
    ? Promise.resolve(personaSettingsOverride)
    : loadServerPersonaSettings(userId);

  const [planTier, checkins, journals, personaSettings] = await Promise.all([
    getUserPlanTier(userId),
    fetchCheckins(userId),
    fetchJournals(userId),
    personaSettingsPromise,
  ]);

  const _ent = getDefaultEntitlements(planTier);
  if (!_ent.enableDeepDive) {
    return {
      patterns: buildLitePatternSnapshot(checkins, journals),
      planTier,
    };
  }

  const structuredCheckins = checkins.map(mapCheckinToDaily);
  const effectiveLanguage = (preferredLanguage as string | undefined) ?? personaSettings?.language ?? "en";
  try {
    const response = await fetch(`${getBaseUrl()}/api/insights/patterns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        planTier,
        checkins: structuredCheckins,
        voiceModel: personaSettings?.voiceModel,
        toneStyle: personaSettings?.toneStyle ?? personaSettings?.tone,
        relationshipMode: personaSettings?.relationshipMode,
        language: effectiveLanguage,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("pattern_api_error");
    }

    const payload = (await response.json()) as {
      patterns?: MemoryProfile["emotionalPatterns"];
    };

    return {
      patterns: payload.patterns ?? EMPTY_PATTERNS,
      planTier,
    };
  } catch (error) {
    // silent fallback
    return {
      patterns: buildLitePatternSnapshot(checkins, journals),
      planTier,
    };
  }
}

import { listLocalJournals } from "@/lib/local/journalLocal";

async function fetchCheckins(userId: string): Promise<CheckinRow[]> {
  try {
    const allCheckins = await getAllCheckIns(userId);
    // PHASE 11: Filter out entries with invalid dates before sorting
    const validCheckins = allCheckins.filter((c) => {
      if (!c.created_at) return false;
      const date = new Date(c.created_at);
      return !isNaN(date.getTime());
    });
    
    // Sort by created_at descending (most recent first) and limit to 20
    const sorted = [...validCheckins]
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      })
      .slice(0, 20);
    
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

function buildLitePatternSnapshot(
  checkins: CheckinRow[],
  journals: JournalRow[],
): MemoryProfile["emotionalPatterns"] {
  const snapshot: MemoryProfile["emotionalPatterns"] = {
    commonPrimaryEmotions: [],
    commonTriggers: [],
    commonFears: [],
    emotionalTendencies: [],
  };

  if (checkins.length >= 4) {
    const half = Math.floor(checkins.length / 2);
    const recentAvgMood = average(checkins.slice(0, half).map((c) => c.mood ?? 0));
    const earlierAvgMood = average(checkins.slice(half).map((c) => c.mood ?? 0));
    if (recentAvgMood < earlierAvgMood - 0.75) {
      snapshot.emotionalTendencies.push("Mood dips across recent entries");
    } else if (recentAvgMood > earlierAvgMood + 0.75) {
      snapshot.emotionalTendencies.push("Mood has been climbing steadily");
    }
  }

  const highStress = checkins.filter((c) => (c.stress ?? 0) >= 7).length;
  if (highStress >= 2) {
    snapshot.commonTriggers.push("High-stress spikes on multiple days");
  }

  const lowEnergy = checkins.filter((c) => (c.energy ?? 0) <= 4).length;
  if (lowEnergy >= Math.max(1, Math.floor(checkins.length / 3))) {
    snapshot.emotionalTendencies.push("Energy frequently trends low mid-week");
  }

  const anxiousKeywords = ["anxious", "worried", "pressure", "tense"];
  const upbeatKeywords = ["grateful", "excited", "hopeful", "proud"];
  const journalText = journals.map((j) => j.content?.toLowerCase() ?? "").join(" ");
  if (journalText && anxiousKeywords.some((word) => journalText.includes(word))) {
    snapshot.commonPrimaryEmotions.push("Anxiety");
    snapshot.commonTriggers.push("Pressure-heavy moments");
  }
  if (journalText && upbeatKeywords.some((word) => journalText.includes(word))) {
    snapshot.commonPrimaryEmotions.push("Hopefulness");
  }

  if (snapshot.commonPrimaryEmotions.length === 0) {
    snapshot.commonPrimaryEmotions.push("Mixed emotions (needs more data)");
  }
  if (snapshot.emotionalTendencies.length === 0) {
    snapshot.emotionalTendencies.push("Keep logging entries for clearer patterns");
  }

  snapshot.commonPrimaryEmotions = dedupe(snapshot.commonPrimaryEmotions).slice(0, 4);
  snapshot.commonTriggers = dedupe(snapshot.commonTriggers).slice(0, 4);
  snapshot.commonFears = dedupe(snapshot.commonFears).slice(0, 4);
  snapshot.emotionalTendencies = dedupe(snapshot.emotionalTendencies).slice(0, 4);

  return snapshot;
}

const EMPTY_PATTERNS: MemoryProfile["emotionalPatterns"] = {
  commonPrimaryEmotions: [],
  commonTriggers: [],
  commonFears: [],
  emotionalTendencies: [],
};

function mapCheckinToDaily(row: CheckinRow): DailyCheckIn {
  const timestamp = row.entry_date ?? row.created_at ?? new Date().toISOString();
  return {
    id: row.id ? String(row.id) : timestamp,
    date: timestamp.slice(0, 10),
    createdAt: row.created_at ?? timestamp,
    mood: row.mood ?? 0,
    stress: row.stress ?? 0,
    energy: row.energy ?? 0,
    focus: row.focus ?? 0,
    note: row.note ?? "",
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + (value ?? 0), 0);
  return sum / values.length;
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter((value) => value && value.trim().length > 0))).map((value) =>
    value.trim(),
  );
}

