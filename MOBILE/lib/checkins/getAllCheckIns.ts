// Phase 6B: Read check-ins from Supabase only. No localStorage.

import { listCheckInsFromDb } from "@/lib/checkins/db";

export type CheckinRow = {
  id: string;
  entry_date: string;
  mood: number;
  stress: number;
  energy: number;
  focus: number;
  created_at: string;
  note?: string | null;
};

export async function getAllCheckIns(userId: string | null): Promise<CheckinRow[]> {
  if (!userId) return [];
  try {
    const rows = await listCheckInsFromDb(userId, 200);
    return rows.map((r) => ({
      id: r.id,
      entry_date: r.entry_date,
      mood: r.mood ?? 0,
      stress: r.stress ?? 0,
      energy: r.energy ?? 0,
      focus: r.focus ?? 0,
      created_at: r.created_at,
      note: r.note ?? null,
    }));
  } catch (error) {
    console.warn("[getAllCheckIns] Failed to load check-ins from DB", error);
    return [];
  }
}

