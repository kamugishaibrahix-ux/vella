/**
 * Phase M3: Per-table migration cursor store in IndexedDB.
 */

import type { IMigrationCursorStore } from "./types";
import { getByKey, put } from "./indexedDB";

const STORE = "migration_cursors" as const;

function id(userId: string, table: string): string {
  return `${userId}:${table}`;
}

export const migrationCursorStore: IMigrationCursorStore = {
  async get(userId: string, table: string) {
    const raw = await getByKey(STORE, id(userId, table));
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    return {
      last_offset: (r.last_offset as number) ?? 0,
      completed: (r.completed as boolean) ?? false,
      checksum: (r.checksum as string | null) ?? null,
    };
  },

  async set(userId: string, table: string, value: { last_offset: number; completed: boolean; checksum?: string | null }) {
    await put(STORE, {
      id: id(userId, table),
      user_id: userId,
      table,
      last_offset: value.last_offset,
      completed: value.completed,
      checksum: value.checksum ?? null,
    });
  },
};
