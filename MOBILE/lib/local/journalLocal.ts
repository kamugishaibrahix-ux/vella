// MOBILE/lib/local/journalLocal.ts
// Phase 6B / M3: Journal metadata in Supabase; content in local (IndexedDB when M3).
// Reads: sync list/get from localStorage (server/anon); async get from IndexedDB for merge.

import { ensureUserId } from "./ensureUserId";
import { loadLocal } from "./storage";
import { indexedDBJournalRepo } from "./db/journalRepo";

export interface LocalJournalEntry {
  id: string;
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const JOURNAL_PATH = (userId: string) => `journals:${userId}:entries`;

export function listLocalJournals(userId?: string): LocalJournalEntry[] {
  const uid = ensureUserId(userId);
  return loadLocal<LocalJournalEntry[]>(JOURNAL_PATH(uid), []) ?? [];
}

export function getLocalJournal(userId: string | undefined, id: string): LocalJournalEntry | null {
  const uid = ensureUserId(userId);
  const all = listLocalJournals(uid);
  return all.find((j) => j.id === id) ?? null;
}

/** M3: Async get from IndexedDB (browser only). Use for merging v2 list with local content. */
export async function getLocalJournalAsync(userId: string | undefined, id: string): Promise<LocalJournalEntry | null> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return getLocalJournal(uid, id);
  const row = await indexedDBJournalRepo.get(uid, id);
  if (!row) return null;
  return {
    id: row.legacy_id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** M3: Write to IndexedDB after API create/update (browser only). */
export async function writeLocalJournalFromApi(
  userId: string | undefined,
  entry: { id: string; title?: string | null; content: string; createdAt: string; updatedAt: string }
): Promise<void> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return;
  await indexedDBJournalRepo.upsertByLegacyId(uid, {
    legacy_id: entry.id,
    title: entry.title ?? null,
    content: entry.content,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  });
}

/** Phase 6B: No-op. Persist via POST /api/journal (Supabase). */
export function createLocalJournal(userId: string | undefined, input: { title?: string | null; content: string }): LocalJournalEntry {
  const uid = ensureUserId(userId);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: input.title ?? null,
    content: input.content,
    createdAt: now,
    updatedAt: now,
  };
}

/** Phase 6B: No-op. Persist via PUT /api/journal (Supabase). */
export function updateLocalJournal(_userId: string | undefined, _id: string, _patch: { title?: string | null; content?: string }) {
  // no-op
}

/** Phase 6B/M3: Remove from IndexedDB when in browser; no server text delete. */
export async function deleteLocalJournal(userId: string | undefined, id: string): Promise<void> {
  const uid = ensureUserId(userId);
  if (typeof window !== "undefined" && window.indexedDB) {
    await indexedDBJournalRepo.delete(uid, id);
  }
}

