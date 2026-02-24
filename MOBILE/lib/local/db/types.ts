/**
 * Phase M3: Local repository interfaces and row types.
 * Aligned with export shapes; legacy_id = server id for idempotency.
 */

export type LocalJournalRow = {
  legacy_id: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  mood_score?: number | null;
};

export type LocalCheckinRow = {
  legacy_id: string;
  entry_date: string;
  mood: number;
  stress: number;
  energy: number;
  focus: number;
  note: string | null;
  created_at: string;
};

export type LocalConversationMessageRow = {
  legacy_id: string;
  /** Stable identity for dedupe; when present, used as legacy_id for upsert. */
  message_id?: string;
  session_id: string | null;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type LocalReportRow = {
  legacy_id: string;
  type: string;
  severity: number;
  status: string;
  summary: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MigrationCursorRow = {
  user_id: string;
  table: string;
  last_offset: number;
  completed: boolean;
  checksum?: string | null;
};

export interface ILocalJournalRepo {
  list(userId: string): Promise<LocalJournalRow[]>;
  get(userId: string, legacyId: string): Promise<LocalJournalRow | null>;
  upsertByLegacyId(userId: string, row: LocalJournalRow): Promise<void>;
  delete(userId: string, legacyId: string): Promise<void>;
}

export interface ILocalCheckinsRepo {
  list(userId: string): Promise<LocalCheckinRow[]>;
  get(userId: string, legacyId: string): Promise<LocalCheckinRow | null>;
  upsertByLegacyId(userId: string, row: LocalCheckinRow): Promise<void>;
  delete(userId: string, legacyId: string): Promise<void>;
}

export interface ILocalConversationRepo {
  listBySession(userId: string, sessionId?: string | null): Promise<LocalConversationMessageRow[]>;
  /** Append or upsert by message_id; pass message_id for dedupe on rehydration. */
  append(userId: string, message: Omit<LocalConversationMessageRow, "legacy_id"> & { message_id?: string }): Promise<void>;
  upsertByLegacyId(userId: string, row: LocalConversationMessageRow): Promise<void>;
  /** Bulk upsert for import (each row has legacy_id). */
  upsertMany(userId: string, rows: LocalConversationMessageRow[]): Promise<void>;
}

export interface ILocalReportsRepo {
  list(userId: string): Promise<LocalReportRow[]>;
  upsertByLegacyId(userId: string, row: LocalReportRow): Promise<void>;
}

export interface IMigrationCursorStore {
  get(userId: string, table: string): Promise<{ last_offset: number; completed: boolean; checksum?: string | null } | null>;
  set(userId: string, table: string, value: { last_offset: number; completed: boolean; checksum?: string | null }): Promise<void>;
}
