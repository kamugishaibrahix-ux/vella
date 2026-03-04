"use server";

import { listLocalJournals } from "@/lib/local/journalLocal";
import { getEmotionalPatterns } from "@/lib/patterns/getEmotionalPatterns";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { listGoals } from "@/lib/goals/goalEngine";
import { analyzeWritingStyle } from "@/lib/memory/analyzeWritingStyle";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";

export type MemorySnapshot = {
  journals: LocalJournalEntry[];
  checkins: CheckinRow[];
  patterns: Awaited<ReturnType<typeof getEmotionalPatterns>>;
  themes: Awaited<ReturnType<typeof getLifeThemes>>;
  loops: Awaited<ReturnType<typeof getBehaviourLoops>>;
  distortions: Awaited<ReturnType<typeof getCognitiveDistortions>>;
  traits: Awaited<ReturnType<typeof getUserTraits>>;
  goals: {
    life: Awaited<ReturnType<typeof listGoals>>;
    focus: Awaited<ReturnType<typeof listGoals>>;
  };
  style: Awaited<ReturnType<typeof analyzeWritingStyle>>;
};

export async function buildMemorySnapshot(userId: string): Promise<MemorySnapshot> {
  if (!userId) {
    throw new Error("[buildMemorySnapshot] userId required");
  }

  const [localJournals, checkins, patterns, themes, loops, distortions, traits, lifeGoals, focusGoals] =
    await Promise.all([
      Promise.resolve(listLocalJournals(userId)),
      getRecentCheckIns(userId, 30),
      getEmotionalPatterns(userId),
      getLifeThemes(userId),
      getBehaviourLoops(userId),
      getCognitiveDistortions(userId),
      getUserTraits(userId),
      listGoals(userId, "life"),
      listGoals(userId, "focus"),
    ]);

  const journals: LocalJournalEntry[] = localJournals
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);

  const goals = {
    life: lifeGoals,
    focus: focusGoals,
  };

  const style = await analyzeWritingStyle(journals);

  return {
    journals,
    checkins,
    patterns,
    themes,
    loops,
    distortions,
    traits,
    goals,
    style,
  };
}

async function getRecentCheckIns(userId: string, limit = 30): Promise<CheckinRow[]> {
  const allCheckins = await getAllCheckIns(userId);
  // Sort by created_at descending (most recent first) and limit
  const sorted = [...allCheckins]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
  
  return sorted.map((c) => ({
    id: c.id,
    created_at: c.created_at,
    entry_date: c.entry_date,
    mood: c.mood,
    stress: c.stress,
    energy: c.energy ?? 0,
    focus: c.focus,
    note: c.note ?? null,
  }));
}

