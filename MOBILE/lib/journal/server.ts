// Phase 6B: All journal reads/writes go to Supabase journal_entries. No localStorage.

import {
  listJournalEntriesFromDb,
  getJournalEntryFromDb,
  createJournalEntryInDb,
  updateJournalEntryInDb,
  deleteJournalEntryInDb,
} from "@/lib/journal/db";
import type { JournalEntryRecord } from "@/lib/journal/types";

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

function rowToRecord(row: { id: string; title: string | null; content: string; createdAt: string; updatedAt: string }): JournalEntryRecord {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listJournalEntries(userId: string | undefined, limit = 50): Promise<JournalEntryRecord[]> {
  if (!userId) return [];
  const rows = await listJournalEntriesFromDb(userId, limit);
  return rows.map(rowToRecord);
}

export async function createJournalEntry(
  userId: string | undefined,
  content: string,
  title?: string | null,
  _enrichment?: JournalEnrichmentPayload | null,
  _enrichmentStatus?: string,
): Promise<JournalEntryRecord> {
  if (!userId) throw new Error("userId required");
  const row = await createJournalEntryInDb(userId, { title, content });
  return rowToRecord(row);
}

export async function updateJournalEntry(
  userId: string | undefined,
  id: string,
  content: string,
  _enrichment?: JournalEnrichmentPayload | null,
  _enrichmentStatus?: string,
): Promise<JournalEntryRecord | null> {
  if (!userId) return null;
  const updated = await updateJournalEntryInDb(userId, id, { content });
  return updated ? rowToRecord(updated) : null;
}

export async function getJournalEntry(userId: string | undefined, id: string): Promise<JournalEntryRecord | null> {
  if (!userId) return null;
  const row = await getJournalEntryFromDb(userId, id);
  return row ? rowToRecord(row) : null;
}

export async function deleteJournalEntry(userId: string | undefined, id: string): Promise<void> {
  if (!userId) return;
  await deleteJournalEntryInDb(userId, id);
}

