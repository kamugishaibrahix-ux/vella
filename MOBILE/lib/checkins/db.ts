/**
 * Phase 6B / M2 Patch: Check-ins storage.
 * NORMAL reads: check_ins_v2 only (no legacy merge).
 * Writes: check_ins_v2 only.
 * Legacy reads: only via migration export.
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";

type RowV2 = Database["public"]["Tables"]["check_ins_v2"]["Row"];
type InsertV2 = Database["public"]["Tables"]["check_ins_v2"]["Insert"];

export type CheckInRow = {
  id: string;
  entry_date: string;
  mood: number | null;
  stress: number | null;
  energy: number | null;
  focus: number | null;
  note: string | null;
  created_at: string;
};

function rowV2ToCheckIn(r: RowV2): CheckInRow {
  return {
    id: r.id,
    entry_date: r.created_at,
    mood: r.mood_score,
    stress: r.stress,
    energy: r.energy,
    focus: r.focus,
    note: null,
    created_at: r.created_at,
  };
}

/** M4.5: Legacy check_ins dropped from safeTables; always false. */
export async function hasLegacyCheckInsData(_userId: string): Promise<boolean> {
  return false;
}

export async function listCheckInsFromDb(
  userId: string,
  limit = 200
): Promise<CheckInRow[]> {
  const { data, error } = await fromSafe("check_ins_v2")
    .select("id, created_at, mood_score, stress, energy, focus")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as RowV2[];
  return rows.map(rowV2ToCheckIn);
}

export async function getCheckInFromDb(
  userId: string,
  id: string
): Promise<CheckInRow | null> {
  const { data, error } = await fromSafe("check_ins_v2")
    .select("id, created_at, mood_score, stress, energy, focus")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowV2ToCheckIn(data as RowV2);
}

export async function createCheckInInDb(
  userId: string,
  input: {
    entry_date: string;
    mood?: number | null;
    stress?: number | null;
    energy?: number | null;
    focus?: number | null;
    note?: string | null;
  }
): Promise<CheckInRow> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const created_at = input.entry_date || new Date().toISOString();
  const insert: InsertV2 = {
    user_id: userId,
    created_at,
    mood_score: input.mood ?? null,
    stress: input.stress ?? null,
    energy: input.energy ?? null,
    focus: input.focus ?? null,
    type_enum: null,
    trigger_enum: null,
    is_deleted: false,
  };
  const { data, error } = await safeInsert(
    "check_ins_v2",
    insert as Record<string, unknown>,
    undefined,
    supabaseAdmin
  )
    .select("id, created_at, mood_score, stress, energy, focus")
    .single();
  if (error) throw error;
  return rowV2ToCheckIn(data as RowV2);
}

export async function updateCheckInInDb(
  userId: string,
  id: string,
  patch: {
    entry_date?: string;
    mood?: number | null;
    stress?: number | null;
    energy?: number | null;
    focus?: number | null;
    note?: string | null;
  }
): Promise<CheckInRow | null> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const updates: Record<string, unknown> = {};
  if (patch.entry_date !== undefined) updates.created_at = patch.entry_date;
  if (patch.mood !== undefined) updates.mood_score = patch.mood;
  if (patch.stress !== undefined) updates.stress = patch.stress;
  if (patch.energy !== undefined) updates.energy = patch.energy;
  if (patch.focus !== undefined) updates.focus = patch.focus;
  if (Object.keys(updates).length === 0) {
    return getCheckInFromDb(userId, id);
  }
  const { data, error } = await safeUpdate(
    "check_ins_v2",
    updates,
    undefined,
    supabaseAdmin
  )
    .eq("user_id", userId)
    .eq("id", id)
    .select("id, created_at, mood_score, stress, energy, focus")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowV2ToCheckIn(data as RowV2);
}

export async function deleteCheckInInDb(userId: string, id: string): Promise<boolean> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const { data: v2Data } = await safeUpdate(
    "check_ins_v2",
    { is_deleted: true } as Record<string, unknown>,
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
