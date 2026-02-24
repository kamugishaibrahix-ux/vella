/**
 * Client-side check-in list/add used by localMemory. Replaces former useCheckins hook exports.
 */

import {
  loadCheckins,
  loadCheckinNotes,
  saveCheckin,
  type LocalCheckin,
} from "@/lib/local/checkinsLocal";
import { ensureUserId } from "@/lib/local/ensureUserId";

export type Checkin = {
  id: string;
  entry_date: string;
  mood: number;
  stress: number;
  energy: number;
  focus: number;
  created_at: string;
  note?: string | null;
};

export type CheckinInput = {
  mood: number;
  energy: number;
  stress: number;
  focus: number;
  note?: string;
  date?: string;
};

export async function listCheckins(options?: { limit?: number }): Promise<Checkin[]> {
  const uid = ensureUserId(undefined);
  const [checkins, notes] = await Promise.all([
    loadCheckins(uid),
    loadCheckinNotes(uid),
  ]);
  const noteMap = new Map(notes.map((n) => [n.id, n.note]));
  const merged: Checkin[] = checkins.map((c) => ({
    id: c.id,
    entry_date: c.entry_date,
    mood: c.mood,
    stress: c.stress,
    energy: c.energy,
    focus: c.focus,
    created_at: c.created_at,
    note: noteMap.get(c.id) ?? c.note ?? null,
  }));
  const limit = options?.limit ?? 100;
  return merged.slice(0, limit);
}

export async function addCheckin(input: CheckinInput): Promise<Checkin> {
  const uid = ensureUserId(undefined);
  const id = crypto.randomUUID?.() ?? `local-${Date.now()}`;
  const now = new Date().toISOString();
  const entry_date = input.date ?? now.slice(0, 10);
  const row: LocalCheckin = {
    id,
    entry_date,
    mood: input.mood,
    stress: input.stress,
    energy: input.energy,
    focus: input.focus,
    created_at: now,
    note: input.note ?? null,
  };
  await saveCheckin(uid, row);
  return {
    id: row.id,
    entry_date: row.entry_date,
    mood: row.mood,
    stress: row.stress,
    energy: row.energy,
    focus: row.focus,
    created_at: row.created_at,
    note: row.note ?? null,
  };
}
