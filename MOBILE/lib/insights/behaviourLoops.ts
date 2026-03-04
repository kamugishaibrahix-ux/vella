"use server";

import { getUserPlanTier } from "@/lib/tiers/server";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";
import { generateEmotionalPatterns } from "./patterns";
import { analyseJournalEntries } from "./journalAnalysis";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";
import { listLocalJournals } from "@/lib/local/journalLocal";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

type JournalRow = LocalJournalEntry;

export type BehaviourLoop = {
  loop: string;
  description: string;
  frequency: number;
};

export async function detectBehaviourLoops(userId: string | null): Promise<BehaviourLoop[]> {
  if (!userId) return [];

  const journals = listLocalJournals(userId);
  if (!journals || journals.length === 0) {
    return [];
  }

  const cleanedJournals = journals.filter((j) => {
    if (!j.id || typeof j.id !== "string") return false;
    if (!j.content || typeof j.content !== "string") return false;
    return true;
  }).slice(0, 20);

  const [planTier, checkins, journalThemes, personaSettings] = await Promise.all([
    getUserPlanTier(userId),
    fetchCheckins(userId),
    analyseJournalEntries(userId),
    loadServerPersonaSettings(userId),
  ]);

  const _ent = getDefaultEntitlements(planTier);
  if (!_ent.enableDeepDive) {
    return heuristicLoops(checkins);
  }

  const patternSnapshot = await generateEmotionalPatterns(
    userId,
    personaSettings?.language ?? "en",
    personaSettings,
  );

  const payload = {
    type: "behaviour_loops" as const,
    data: {
      checkins: checkins.slice(0, 40),
      journals: cleanedJournals.slice(0, 20),
      patterns: patternSnapshot.patterns,
      journalThemes,
    },
    planTier,
    userId,
  };

  const response = await callVellaReflectionAPI(payload);
  if (response.type === "ai_response") {
    const parsed = parseLoopResponse(response.message);
    if (parsed.length > 0) return parsed;
  }

  return heuristicLoops(checkins);
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
    
    // Sort by created_at descending (most recent first) and limit to 40
    const sorted = [...validCheckins]
      .sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      })
      .slice(0, 40);
    
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

function heuristicLoops(checkins: CheckinRow[]): BehaviourLoop[] {
  if (checkins.length === 0) {
    return [
      {
        loop: "Still gathering data",
        description: "Log a few new check-ins and journals so I can spot your behaviour loops.",
        frequency: 0,
      },
    ];
  }

  const loops: BehaviourLoop[] = [];

  const highStressCount = checkins.filter((entry) => (entry.stress ?? 0) >= 7).length;
  const lowFocusCount = checkins.filter((entry) => (entry.focus ?? 0) <= 4).length;
  if (highStressCount >= 3 && lowFocusCount >= 2) {
    loops.push({
      loop: "Stress → focus dips",
      description: "Sustained spikes in stress are followed by low focus on multiple days.",
      frequency: Math.min(highStressCount, 5),
    });
  }

  const lowEnergyEntries = checkins.filter((entry) => (entry.energy ?? 0) <= 3);
  if (lowEnergyEntries.length >= 3) {
    loops.push({
      loop: "Fatigue pacing",
      description:
        "Energy drops appear several times this week. Try pairing big pushes with recovery windows.",
      frequency: Math.min(lowEnergyEntries.length, 5),
    });
  }

  const lateNightTension = checkins.filter((entry) => {
    const timestamp = entry.created_at ?? entry.entry_date ?? "";
    if (!timestamp) return false;
    const hours = new Date(timestamp).getHours();
    const note = entry.note?.toLowerCase() ?? "";
    const stress = entry.stress ?? 0;
    return (hours >= 22 || /night|late|sleep/.test(note)) && stress >= 6;
  }).length;
  if (lateNightTension >= 2) {
    loops.push({
      loop: "Late-night rumination",
      description: "Tension ramps up late at night—consider winding down before the stress spike.",
      frequency: Math.min(lateNightTension, 4),
    });
  }

  if (loops.length === 0) {
    loops.push({
      loop: "Emerging patterns",
      description: "No strong loops detected yet—keep logging and we’ll surface them soon.",
      frequency: 1,
    });
  }

  return loops;
}

function parseLoopResponse(text: string | undefined): BehaviourLoop[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): BehaviourLoop | null => {
      const [loop, rest] = line.split(":").map((part) => part.trim());
      if (!loop || !rest) return null;
      const freqMatch = rest.match(/(\d+)/);
      return {
        loop,
        description: rest.replace(/(\d+)/, "").trim(),
        frequency: freqMatch ? parseInt(freqMatch[1], 10) : 1,
      };
    })
    .filter((item): item is BehaviourLoop => Boolean(item))
    .slice(0, 5);
}

