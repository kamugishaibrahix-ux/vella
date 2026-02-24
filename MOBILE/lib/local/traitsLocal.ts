// MOBILE/lib/local/traitsLocal.ts

import { loadLocal, saveLocal } from "./storage";
import { ensureUserId } from "./ensureUserId";
import type { TraitScores } from "@/lib/traits/adaptiveTraits";

export interface LocalTraitsSnapshot {
  userId: string;
  scores: TraitScores;
  lastComputedAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface LocalTraitHistoryEntry {
  id: string;
  userId: string;
  windowStart: string; // ISO
  windowEnd: string; // ISO
  scores: TraitScores;
  createdAt: string; // ISO
}

const TRAITS_KEY = (userId: string) => `traits:${userId}:current`;
const TRAITS_HISTORY_KEY = (userId: string) => `traits:${userId}:history`;

export function loadLocalTraits(userId: string | undefined): LocalTraitsSnapshot | null {
  const uid = ensureUserId(userId);
  return loadLocal<LocalTraitsSnapshot | null>(TRAITS_KEY(uid), null);
}

export function saveLocalTraits(userId: string | undefined, snapshot: LocalTraitsSnapshot): void {
  const uid = ensureUserId(userId);
  saveLocal(TRAITS_KEY(uid), snapshot);
}

export function loadLocalTraitHistory(userId: string | undefined): LocalTraitHistoryEntry[] {
  const uid = ensureUserId(userId);
  return loadLocal<LocalTraitHistoryEntry[]>(TRAITS_HISTORY_KEY(uid), []) ?? [];
}

export function appendLocalTraitHistory(userId: string | undefined, entry: LocalTraitHistoryEntry): void {
  const uid = ensureUserId(userId);
  const history = loadLocalTraitHistory(uid);
  history.push(entry);
  // Sort by createdAt descending (most recent first)
  history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  saveLocal(TRAITS_HISTORY_KEY(uid), history);
}

