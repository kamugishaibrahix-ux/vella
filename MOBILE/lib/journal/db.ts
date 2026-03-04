/**
 * LOCAL-FIRST JOURNAL — DB layer stores metadata only.
 * No text, title, or content columns exist in journal_entries_v2.
 * Writes: journal_entries_v2 (metadata: id, timestamps, word_count, local_hash).
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";

type RowV2 = Database["public"]["Tables"]["journal_entries_v2"]["Row"];
type InsertV2 = Database["public"]["Tables"]["journal_entries_v2"]["Insert"];

export type JournalEntryRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  localHash: string;
  processingMode: string;
};

function rowFromV2(r: RowV2): JournalEntryRow {
  return {
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    wordCount: r.word_count ?? 0,
    localHash: r.local_hash ?? "",
    processingMode: "private",
  };
}

/** M4.5: Legacy journal_entries dropped from safeTables; always false. */
export async function hasLegacyJournalData(_userId: string): Promise<boolean> {
  return false;
}

export async function listJournalEntriesFromDb(
  userId: string,
  limit = 50
): Promise<JournalEntryRow[]> {
  const { data, error } = await fromSafe("journal_entries_v2")
    .select("id, created_at, updated_at, word_count, local_hash")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as RowV2[];
  return rows.map(rowFromV2);
}

export async function getJournalEntryFromDb(
  userId: string,
  id: string
): Promise<JournalEntryRow | null> {
  const { data, error } = await fromSafe("journal_entries_v2")
    .select("id, created_at, updated_at, word_count, local_hash")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowFromV2(data as RowV2);
}

export async function createJournalMetaInDb(
  userId: string,
  meta: { id: string; created_at?: string; updated_at?: string; word_count: number; local_hash: string; processing_mode: string }
): Promise<JournalEntryRow> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const now = new Date().toISOString();
  const insert: InsertV2 = {
    id: meta.id,
    user_id: userId,
    created_at: meta.created_at ?? now,
    updated_at: meta.updated_at ?? now,
    word_count: meta.word_count,
    local_hash: meta.local_hash,
    mood_score: null,
    is_deleted: false,
  };
  const { data, error } = await safeInsert(
    "journal_entries_v2",
    insert as Record<string, unknown>,
    undefined,
    supabaseAdmin
  )
    .select("id, created_at, updated_at, word_count, local_hash")
    .single();
  if (error) throw error;
  return rowFromV2(data as RowV2);
}

export async function updateJournalMetaInDb(
  userId: string,
  id: string,
  meta: { word_count: number; local_hash: string; updated_at?: string }
): Promise<JournalEntryRow | null> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    updated_at: meta.updated_at ?? now,
    word_count: meta.word_count,
    local_hash: meta.local_hash,
  };
  const { data, error } = await safeUpdate(
    "journal_entries_v2",
    updates,
    undefined,
    supabaseAdmin
  )
    .eq("user_id", userId)
    .eq("id", id)
    .select("id, created_at, updated_at, word_count, local_hash")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowFromV2(data as RowV2);
}

export async function deleteJournalEntryInDb(userId: string, id: string): Promise<boolean> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const now = new Date().toISOString();
  const { data: v2Data } = await safeUpdate(
    "journal_entries_v2",
    { is_deleted: true, updated_at: now } as Record<string, unknown>,
    undefined,
    supabaseAdmin
  )
    .eq("user_id", userId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (v2Data) return true;
  return false;
}
