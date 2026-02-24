/**
 * Phase M3.5: IndexedDB-backed journal repository with encryption for title/content.
 */

import type { ILocalJournalRepo, LocalJournalRow } from "./types";
import { getByKey, put, remove, getAllByIndex } from "./indexedDB";
import { encryptField, decryptField } from "../encryption";

const STORE = "journals" as const;

function id(userId: string, legacyId: string): string {
  return `${userId}:${legacyId}`;
}

export const indexedDBJournalRepo: ILocalJournalRepo = {
  async list(userId: string): Promise<LocalJournalRow[]> {
    const raw = await getAllByIndex(STORE, "userId", userId);
    const rows = await Promise.all(
      (raw as { legacy_id: string; title: string | null; content: string; created_at: string; updated_at: string; mood_score?: number | null }[]).map(
        async (r) => ({
          legacy_id: r.legacy_id,
          title: await decryptField(r.title, userId, r.legacy_id, "title"),
          content: (await decryptField(r.content, userId, r.legacy_id, "content")) ?? "",
          created_at: r.created_at,
          updated_at: r.updated_at,
          mood_score: r.mood_score,
        })
      )
    );
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async get(userId: string, legacyId: string): Promise<LocalJournalRow | null> {
    const raw = await getByKey(STORE, id(userId, legacyId));
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const legId = r.legacy_id as string;
    return {
      legacy_id: legId,
      title: await decryptField(r.title as string | null, userId, legId, "title"),
      content: (await decryptField(r.content as string, userId, legId, "content")) ?? "",
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      mood_score: r.mood_score as number | null | undefined,
    };
  },

  async upsertByLegacyId(userId: string, row: LocalJournalRow): Promise<void> {
    const legId = row.legacy_id;
    const titleStored = row.title != null ? await encryptField(row.title, userId, legId, "title") : null;
    const contentStored = await encryptField(row.content, userId, legId, "content");
    await put(STORE, {
      id: id(userId, legId),
      userId,
      legacy_id: legId,
      title: titleStored,
      content: contentStored,
      created_at: row.created_at,
      updated_at: row.updated_at,
      mood_score: row.mood_score ?? null,
    });
  },

  async delete(userId: string, legacyId: string): Promise<void> {
    await remove(STORE, id(userId, legacyId));
  },
};
