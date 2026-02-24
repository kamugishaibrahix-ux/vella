"use server";

import { loadLocalTraitHistory, type LocalTraitHistoryEntry } from "@/lib/local/traitsLocal";
import type { TraitScores } from "@/lib/traits/adaptiveTraits";

// TraitHistoryRow type that matches what callers expect
// This maintains compatibility with existing code that uses this type
export type TraitHistoryRow = {
  id: string;
  user_id: string;
  window_start: string;
  window_end: string;
  resilience: number;
  clarity: number;
  discipline: number;
  emotional_stability: number;
  motivation: number;
  self_compassion: number;
  created_at: string;
  // Optional fields that might be used by some callers
  trait?: string | null;
  delta?: number | null;
};

export async function listTraitHistory(userId: string | null, limit = 50): Promise<TraitHistoryRow[]> {
  if (!userId) return [];
  
  const history = loadLocalTraitHistory(userId);
  
  // Sort by window_end ascending (oldest first) to match previous behavior
  const sorted = [...history].sort(
    (a, b) => new Date(a.windowEnd).getTime() - new Date(b.windowEnd).getTime()
  );
  
  // Apply limit
  const limited = sorted.slice(0, limit);
  
  // Map to TraitHistoryRow format for compatibility
  return limited.map((entry) => ({
    id: entry.id,
    user_id: entry.userId,
    window_start: entry.windowStart,
    window_end: entry.windowEnd,
    resilience: entry.scores.resilience,
    clarity: entry.scores.clarity,
    discipline: entry.scores.discipline,
    emotional_stability: entry.scores.emotional_stability,
    motivation: entry.scores.motivation,
    self_compassion: entry.scores.self_compassion,
    created_at: entry.createdAt,
    trait: null,
    delta: null,
  }));
}

