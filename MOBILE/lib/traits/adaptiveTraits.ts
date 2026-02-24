"use server";

// TODO[privacy]: This module still reads Supabase journal/checkin content.
// Once the local-only insight engine is wired, switch the data source
// to lib/local/localJournals and lib/local/localCheckins.

import { detectBehaviourLoops } from "@/lib/insights/behaviourLoops";
import { detectCognitiveDistortions } from "@/lib/insights/cognitiveDistortions";
import { generateEmotionalPatterns } from "@/lib/insights/patterns";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import type { MemoryProfile } from "@/lib/memory/types";
import {
  loadLocalTraits,
  saveLocalTraits,
  loadLocalTraitHistory,
  appendLocalTraitHistory,
  type LocalTraitsSnapshot,
  type LocalTraitHistoryEntry,
} from "@/lib/local/traitsLocal";
import { getAllCheckIns, type CheckinRow } from "@/lib/checkins/getAllCheckIns";

export type TraitScores = {
  resilience: number;
  clarity: number;
  discipline: number;
  emotional_stability: number;
  motivation: number;
  self_compassion: number;
};

export type TraitSignals = {
  avgMood: number | null;
  moodVolatility: number | null;
  avgStress: number | null;
  avgFocus: number | null;
  checkinCount: number;
  journalCount: number;
  loopCount: number;
  distortionCount: number;
  patternCount: number;
  windowDays: number;
};

const DEFAULT_SCORES: TraitScores = {
  resilience: 50,
  clarity: 50,
  discipline: 50,
  emotional_stability: 50,
  motivation: 50,
  self_compassion: 50,
};

const DEFAULT_SIGNALS: TraitSignals = {
  avgMood: null,
  moodVolatility: null,
  avgStress: null,
  avgFocus: null,
  checkinCount: 0,
  journalCount: 0,
  loopCount: 0,
  distortionCount: 0,
  patternCount: 0,
  windowDays: 30,
};


export async function collectTraitSignals(userId: string, windowDays = 30): Promise<TraitSignals> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const sinceIso = windowStart.toISOString();

  try {
    const [checkins, journals, loops, distortions, personaSettings] = await Promise.all([
      fetchCheckins(userId, sinceIso),
      fetchJournals(userId, sinceIso),
      detectBehaviourLoops(userId),
      detectCognitiveDistortions(userId),
      loadServerPersonaSettings(userId),
    ]);
    const patternSnapshot = await generateEmotionalPatterns(
      userId,
      personaSettings?.language ?? "en",
      personaSettings,
    );

    const moods = checkins.map((c) => c.mood).filter(isNumber);
    const stresses = checkins.map((c) => c.stress).filter(isNumber);
    const focusValues = checkins.map((c) => c.focus).filter(isNumber);

    const avgMood = moods.length ? average(moods) : null;
    const avgStress = stresses.length ? average(stresses) : null;
    const avgFocus = focusValues.length ? average(focusValues) : null;

    const moodVolatility =
      moods.length >= 2 ? Math.max(...moods) - Math.min(...moods) : moods.length ? 0 : null;

    return {
      avgMood,
      avgStress,
      avgFocus,
      moodVolatility,
      checkinCount: checkins.length,
      journalCount: journals.length,
      loopCount: loops.length,
      distortionCount: distortions.length,
      patternCount: countPatternSignals(patternSnapshot.patterns),
      windowDays,
    };
  } catch (error) {
    // silent fallback
    return { ...DEFAULT_SIGNALS, windowDays };
  }
}

function countPatternSignals(patterns: MemoryProfile["emotionalPatterns"]) {
  return (
    (patterns.commonPrimaryEmotions?.length ?? 0) +
    (patterns.commonTriggers?.length ?? 0) +
    (patterns.commonFears?.length ?? 0) +
    (patterns.emotionalTendencies?.length ?? 0)
  );
}

function computeTraitScores(signals: TraitSignals): TraitScores {
  const safeAvgMood = signals.avgMood ?? 5;
  const safeAvgStress = signals.avgStress ?? 5;
  const safeAvgFocus = signals.avgFocus ?? 5;
  const volatility = signals.moodVolatility ?? 0;
  const density = Math.min(1, signals.checkinCount / Math.max(1, signals.windowDays));
  const journalSignal = Math.min(1, signals.journalCount / 15);
  const patternSignal = Math.min(signals.patternCount / 6, 1);

  const resilience =
    55 +
    (safeAvgMood - 5) * 6 -
    volatility * 5 -
    (safeAvgStress - 5) * 4 +
    density * 20;

  const clarity = 50 + (safeAvgFocus - 5) * 8 + journalSignal * 10 + patternSignal * 12;

  const discipline =
    48 +
    density * 30 +
    journalSignal * 10 -
    Math.min(signals.loopCount * 2, 12);

  const emotionalStability = 70 - volatility * 8 - Math.max(0, safeAvgStress - 5) * 4;

  const motivation =
    52 +
    (safeAvgMood - 5) * 5 +
    density * 15 -
    Math.min(signals.loopCount * 3, 12);

  const selfCompassion =
    60 -
    Math.min(signals.distortionCount * 3, 25) +
    (signals.journalCount > 0 ? 5 : 0);

  return {
    resilience: clamp(resilience),
    clarity: clamp(clarity),
    discipline: clamp(discipline),
    emotional_stability: clamp(emotionalStability),
    motivation: clamp(motivation),
    self_compassion: clamp(selfCompassion),
  };
}

export async function upsertUserTraits(userId: string, windowDays = 30): Promise<TraitScores> {
  const signals = await collectTraitSignals(userId, windowDays);
  const scores = computeTraitScores(signals);

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const windowEndIso = now.toISOString();
  const windowStartIso = windowStart.toISOString();

  // Save current traits snapshot
  const snapshot: LocalTraitsSnapshot = {
    userId,
    scores,
    lastComputedAt: windowEndIso,
    updatedAt: windowEndIso,
  };
  saveLocalTraits(userId, snapshot);

  // Append to history
  const historyEntry: LocalTraitHistoryEntry = {
    id: `${userId}-${windowEndIso}-${Math.random().toString(36).substring(2, 15)}`,
    userId,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    scores,
    createdAt: windowEndIso,
  };
  appendLocalTraitHistory(userId, historyEntry);

  return scores;
}

export async function getUserTraits(userId: string): Promise<TraitScores | null> {
  try {
    const snapshot = loadLocalTraits(userId);
    if (!snapshot) {
      return await upsertUserTraits(userId);
    }
    return snapshot.scores;
  } catch (error) {
    // silent fallback
    return null;
  }
}

import { listLocalJournals } from "@/lib/local/journalLocal";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";

async function fetchCheckins(userId: string, sinceIso: string): Promise<CheckinRow[]> {
  const allCheckins = await getAllCheckIns(userId);
  const since = new Date(sinceIso);
  return allCheckins
    .filter((c) => new Date(c.created_at) >= since)
    .slice(0, 200)
    .map((c) => ({
      id: c.id,
      mood: c.mood,
      stress: c.stress,
      energy: c.energy,
      focus: c.focus,
      created_at: c.created_at,
      entry_date: c.entry_date,
    }));
}

async function fetchJournals(userId: string, sinceIso: string): Promise<LocalJournalEntry[]> {
  const journals = listLocalJournals(userId);
  const since = new Date(sinceIso);
  return journals.filter((j) => new Date(j.createdAt) >= since);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

