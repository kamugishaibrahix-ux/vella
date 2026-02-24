/**
 * Phase M3.5: IndexedDB-backed conversation repository with encryption for content.
 */

import type { ILocalConversationRepo, LocalConversationMessageRow } from "./types";
import { put, getAllByIndex } from "./indexedDB";
import { encryptField, decryptField } from "../encryption";

const STORE = "conversations" as const;

function id(userId: string, legacyId: string): string {
  return `${userId}:${legacyId}`;
}

export const indexedDBConversationRepo: ILocalConversationRepo = {
  async listBySession(userId: string, sessionId?: string | null): Promise<LocalConversationMessageRow[]> {
    const raw = await getAllByIndex(STORE, "userId", userId);
    const rows = await Promise.all(
      (raw as LocalConversationMessageRow[]).map(async (r) => ({
        legacy_id: r.legacy_id,
        message_id: r.legacy_id,
        session_id: r.session_id,
        role: r.role,
        content: (await decryptField(r.content, userId, r.legacy_id, "content")) ?? "",
        created_at: r.created_at,
      }))
    );
    const filtered = sessionId != null && sessionId !== "" ? rows.filter((r) => r.session_id === sessionId) : rows;
    return filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
  },

  async append(
    userId: string,
    message: Omit<LocalConversationMessageRow, "legacy_id"> & { message_id?: string }
  ): Promise<void> {
    const legacyId = message.message_id ?? crypto.randomUUID();
    const contentStored = await encryptField(message.content, userId, legacyId, "content");
    await put(STORE, {
      id: id(userId, legacyId),
      userId,
      legacy_id: legacyId,
      session_id: message.session_id ?? null,
      role: message.role,
      content: contentStored,
      created_at: message.created_at,
    });
  },

  async upsertByLegacyId(userId: string, row: LocalConversationMessageRow): Promise<void> {
    const contentStored = await encryptField(row.content, userId, row.legacy_id, "content");
    await put(STORE, {
      id: id(userId, row.legacy_id),
      userId,
      legacy_id: row.legacy_id,
      session_id: row.session_id ?? null,
      role: row.role,
      content: contentStored,
      created_at: row.created_at,
    });
  },

  async upsertMany(userId: string, rows: LocalConversationMessageRow[]): Promise<void> {
    for (const row of rows) {
      await this.upsertByLegacyId(userId, row);
    }
  },
};
