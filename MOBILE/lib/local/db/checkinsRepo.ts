/**
 * Phase M3.5: IndexedDB-backed check-ins repository with encryption for note.
 */

import type { ILocalCheckinsRepo, LocalCheckinRow } from "./types";
import { getByKey, put, remove, getAllByIndex } from "./indexedDB";
import { encryptField, decryptField } from "../encryption";

const STORE = "checkins" as const;

function id(userId: string, legacyId: string): string {
  return `${userId}:${legacyId}`;
}

export const indexedDBCheckinsRepo: ILocalCheckinsRepo = {
  async list(userId: string): Promise<LocalCheckinRow[]> {
    const raw = await getAllByIndex(STORE, "userId", userId);
    const rows = await Promise.all(
      (raw as LocalCheckinRow[]).map(async (r) => ({
        legacy_id: r.legacy_id,
        entry_date: r.entry_date,
        mood: r.mood,
        stress: r.stress,
        energy: r.energy,
        focus: r.focus,
        note: await decryptField(r.note ?? null, userId, r.legacy_id, "note"),
        created_at: r.created_at,
      }))
    );
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async get(userId: string, legacyId: string): Promise<LocalCheckinRow | null> {
    const raw = await getByKey(STORE, id(userId, legacyId));
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const legId = r.legacy_id as string;
    return {
      legacy_id: legId,
      entry_date: r.entry_date as string,
      mood: r.mood as number,
      stress: r.stress as number,
      energy: r.energy as number,
      focus: r.focus as number,
      note: await decryptField((r.note as string | null) ?? null, userId, legId, "note"),
      created_at: r.created_at as string,
    };
  },

  async upsertByLegacyId(userId: string, row: LocalCheckinRow): Promise<void> {
    const legId = row.legacy_id;
    const noteStored = row.note != null ? await encryptField(row.note, userId, legId, "note") : null;
    await put(STORE, {
      id: id(userId, legId),
      userId,
      legacy_id: legId,
      entry_date: row.entry_date,
      mood: row.mood,
      stress: row.stress,
      energy: row.energy,
      focus: row.focus,
      note: noteStored,
      created_at: row.created_at,
    });
  },

  async delete(userId: string, legacyId: string): Promise<void> {
    await remove(STORE, id(userId, legacyId));
  },
};
