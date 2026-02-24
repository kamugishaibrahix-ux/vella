/**
 * Phase M3.5: IndexedDB-backed reports repository with encryption for summary/notes.
 */

import type { ILocalReportsRepo, LocalReportRow } from "./types";
import { put, getAllByIndex } from "./indexedDB";
import { encryptField, decryptField } from "../encryption";

const STORE = "reports" as const;

function id(userId: string, legacyId: string): string {
  return `${userId}:${legacyId}`;
}

export const indexedDBReportsRepo: ILocalReportsRepo = {
  async list(userId: string): Promise<LocalReportRow[]> {
    const raw = await getAllByIndex(STORE, "userId", userId);
    const rows = await Promise.all(
      (raw as LocalReportRow[]).map(async (r) => ({
        legacy_id: r.legacy_id,
        type: r.type,
        severity: r.severity,
        status: r.status,
        summary: await decryptField(r.summary ?? null, userId, r.legacy_id, "summary"),
        notes: await decryptField(r.notes ?? null, userId, r.legacy_id, "notes"),
        created_at: r.created_at,
        updated_at: r.updated_at,
      }))
    );
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async upsertByLegacyId(userId: string, row: LocalReportRow): Promise<void> {
    const legId = row.legacy_id;
    const summaryStored = row.summary != null ? await encryptField(row.summary, userId, legId, "summary") : null;
    const notesStored = row.notes != null ? await encryptField(row.notes, userId, legId, "notes") : null;
    await put(STORE, {
      id: id(userId, legId),
      userId,
      legacy_id: legId,
      type: row.type,
      severity: row.severity,
      status: row.status,
      summary: summaryStored,
      notes: notesStored,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  },
};
