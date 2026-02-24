"use server";

import type { TraitScores } from "@/lib/traits/adaptiveTraits";
import { loadLocalTraitHistory, type LocalTraitHistoryEntry } from "@/lib/local/traitsLocal";

export async function getPreviousTraitSnapshot(userId: string): Promise<TraitScores | null> {
  const history = loadLocalTraitHistory(userId);
  
  // History is already sorted by createdAt descending (most recent first)
  if (history.length < 2) {
    return null;
  }

  // Return the second most recent entry (index 1)
  return history[1].scores;
}

