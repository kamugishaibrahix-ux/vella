// LOCAL-FIRST JOURNAL — server stores metadata only.
// Text/title never reach this layer.

import {
  listJournalEntriesFromDb,
  getJournalEntryFromDb,
  createJournalMetaInDb,
  updateJournalMetaInDb,
  deleteJournalEntryInDb,
} from "@/lib/journal/db";

export type JournalEnrichmentPayload = {
  summary?: string | null;
  tags?: string[];
  themes?: string[];
  loops?: string[];
  distortions?: string[];
  traits?: string[];
  questions?: string[];
  microInsights?: string[];
};

export type JournalMetaInput = {
  id: string;
  created_at?: string;
  updated_at?: string;
  word_count: number;
  local_hash: string;
  processing_mode: "private" | "signals_only";
};

export type JournalMetaRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  localHash: string;
  processingMode: string;
};

function rowToMeta(row: { id: string; createdAt: string; updatedAt: string; wordCount: number; localHash: string; processingMode: string }): JournalMetaRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    wordCount: row.wordCount,
    localHash: row.localHash,
    processingMode: row.processingMode,
  };
}

export async function listJournalEntries(userId: string | undefined, limit = 50): Promise<JournalMetaRecord[]> {
  if (!userId) return [];
  const rows = await listJournalEntriesFromDb(userId, limit);
  return rows.map(rowToMeta);
}

export async function createJournalMeta(
  userId: string,
  meta: JournalMetaInput,
): Promise<JournalMetaRecord> {
  if (!userId) throw new Error("userId required");
  const row = await createJournalMetaInDb(userId, meta);
  return rowToMeta(row);
}

export async function updateJournalMeta(
  userId: string,
  meta: JournalMetaInput,
): Promise<JournalMetaRecord | null> {
  if (!userId) return null;
  const updated = await updateJournalMetaInDb(userId, meta.id, meta);
  return updated ? rowToMeta(updated) : null;
}

export async function getJournalEntry(userId: string | undefined, id: string): Promise<JournalMetaRecord | null> {
  if (!userId) return null;
  const row = await getJournalEntryFromDb(userId, id);
  return row ? rowToMeta(row) : null;
}

export async function deleteJournalEntry(userId: string | undefined, id: string): Promise<void> {
  if (!userId) return;
  await deleteJournalEntryInDb(userId, id);
}

