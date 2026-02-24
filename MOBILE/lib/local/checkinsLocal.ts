// MOBILE/lib/local/checkinsLocal.ts
// Phase M3.5: Check-ins source of truth in IndexedDB; server is metadata-only.

import { ensureUserId } from "./ensureUserId";
import { indexedDBCheckinsRepo } from "./db/checkinsRepo";

export interface LocalCheckinNote {
  id: string;
  note: string;
  createdAt: string;
}

export interface LocalCheckin {
  id: string;
  entry_date: string;
  mood: number;
  stress: number;
  energy: number;
  focus: number;
  created_at: string;
  note?: string | null;
}

/** M3.5: Persist checkin to local repo (IndexedDB in browser). */
export async function saveCheckin(userId: string | undefined, checkin: LocalCheckin): Promise<void> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return;
  await indexedDBCheckinsRepo.upsertByLegacyId(uid, {
    legacy_id: checkin.id,
    entry_date: checkin.entry_date,
    mood: checkin.mood,
    stress: checkin.stress,
    energy: checkin.energy,
    focus: checkin.focus,
    note: checkin.note ?? null,
    created_at: checkin.created_at,
  });
}

/** M3.5: Load checkins from local repo (IndexedDB in browser). */
export async function loadCheckins(userId: string | undefined): Promise<LocalCheckin[]> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return [];
  const rows = await indexedDBCheckinsRepo.list(uid);
  return rows.map((r) => ({
    id: r.legacy_id,
    entry_date: r.entry_date,
    mood: r.mood,
    stress: r.stress,
    energy: r.energy,
    focus: r.focus,
    created_at: r.created_at,
    note: r.note ?? null,
  }));
}

/** M3.5: Update note for a checkin in local repo (upsert row with existing data + new note). */
export async function saveCheckinNote(
  userId: string | undefined,
  checkinId: string,
  note: string
): Promise<void> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return;
  const existing = await indexedDBCheckinsRepo.get(uid, checkinId);
  const created_at = existing?.created_at ?? new Date().toISOString();
  const entry_date = existing?.entry_date ?? new Date().toISOString().slice(0, 10);
  await indexedDBCheckinsRepo.upsertByLegacyId(uid, {
    legacy_id: checkinId,
    entry_date: existing?.entry_date ?? entry_date,
    mood: existing?.mood ?? 0,
    stress: existing?.stress ?? 0,
    energy: existing?.energy ?? 0,
    focus: existing?.focus ?? 0,
    note,
    created_at,
  });
}

/** M3.5: Load notes from local repo (checkins with non-empty note). */
export async function loadCheckinNotes(userId: string | undefined): Promise<LocalCheckinNote[]> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return [];
  const rows = await indexedDBCheckinsRepo.list(uid);
  return rows
    .filter((r) => r.note != null && r.note !== "")
    .map((r) => ({
      id: r.legacy_id,
      note: r.note!,
      createdAt: r.created_at,
    }));
}

/** Phase 6B/M3: Remove from IndexedDB when in browser. */
export async function deleteCheckin(userId: string | undefined, checkinId: string): Promise<void> {
  const uid = ensureUserId(userId);
  if (typeof window !== "undefined" && window.indexedDB) {
    await indexedDBCheckinsRepo.delete(uid, checkinId);
  }
}

/** M3: Async get from IndexedDB (browser only). Use for merging v2 list with local note. */
export async function getLocalCheckinAsync(
  userId: string | undefined,
  id: string
): Promise<{ id: string; entry_date: string; mood: number; stress: number; energy: number; focus: number; created_at: string; note: string | null } | null> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return null;
  const row = await indexedDBCheckinsRepo.get(uid, id);
  if (!row) return null;
  return {
    id: row.legacy_id,
    entry_date: row.entry_date,
    mood: row.mood,
    stress: row.stress,
    energy: row.energy,
    focus: row.focus,
    created_at: row.created_at,
    note: row.note ?? null,
  };
}

/** M3: Write to IndexedDB after API create/update (browser only). */
export async function writeLocalCheckinFromApi(
  userId: string | undefined,
  row: {
    id: string;
    entry_date: string;
    mood: number;
    stress: number;
    energy: number;
    focus: number;
    created_at: string;
    note?: string | null;
  }
): Promise<void> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return;
  await indexedDBCheckinsRepo.upsertByLegacyId(uid, {
    legacy_id: row.id,
    entry_date: row.entry_date,
    mood: row.mood,
    stress: row.stress,
    energy: row.energy,
    focus: row.focus,
    note: row.note ?? null,
    created_at: row.created_at,
  });
}

