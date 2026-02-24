/**
 * Phase 6B / M2 Patch: Journal storage.
 * NORMAL reads: journal_entries_v2 only (no legacy merge).
 * Writes: journal_entries_v2 only.
 * Legacy reads: only via migration export (see migration export routes).
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";

type RowV2 = Database["public"]["Tables"]["journal_entries_v2"]["Row"];
type InsertV2 = Database["public"]["Tables"]["journal_entries_v2"]["Insert"];

export type JournalEntryRow = {
  id: string;
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
};

function stubFromV2(r: RowV2): JournalEntryRow {
  return {
    id: r.id,
    title: null,
    content: "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function wordCount(text: string): number {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
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
    .select("id, created_at, updated_at")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as RowV2[];
  return rows.map(stubFromV2);
}

export async function getJournalEntryFromDb(
  userId: string,
  id: string
): Promise<JournalEntryRow | null> {
  const { data, error } = await fromSafe("journal_entries_v2")
    .select("id, created_at, updated_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return stubFromV2(data as RowV2);
}

export async function createJournalEntryInDb(
  userId: string,
  input: { title?: string | null; content: string; local_hash?: string | null }
): Promise<JournalEntryRow> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const now = new Date().toISOString();
  const insert: InsertV2 = {
    user_id: userId,
    created_at: now,
    updated_at: now,
    word_count: wordCount(input.content),
    local_hash: input.local_hash ?? null,
    mood_score: null,
    is_deleted: false,
  };
  const { data, error } = await safeInsert(
    "journal_entries_v2",
    insert as Record<string, unknown>,
    undefined,
    supabaseAdmin
  )
    .select("id, created_at, updated_at")
    .single();
  if (error) throw error;
  const r = data as RowV2;
  return stubFromV2({ ...r, created_at: r.created_at, updated_at: r.updated_at });
}

export async function updateJournalEntryInDb(
  userId: string,
  id: string,
  patch: { title?: string | null; content?: string; word_count?: number; local_hash?: string | null }
): Promise<JournalEntryRow | null> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  if (patch.word_count !== undefined) updates.word_count = patch.word_count;
  else if (patch.content !== undefined) updates.word_count = wordCount(patch.content);
  if (patch.local_hash !== undefined) updates.local_hash = patch.local_hash;
  const { data, error } = await safeUpdate(
    "journal_entries_v2",
    updates,
    undefined,
    supabaseAdmin
  )
    .eq("user_id", userId)
    .eq("id", id)
    .select("id, created_at, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as RowV2;
  return stubFromV2({ ...r, created_at: r.created_at, updated_at: r.updated_at });
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
