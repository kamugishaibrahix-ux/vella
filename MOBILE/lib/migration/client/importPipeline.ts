/**
 * Phase M3: Import pipeline – fetch from export endpoints and upsert into local repos.
 * Idempotent (upsert by legacy_id), resumable (cursor).
 * SAFETY: Never log response body, res.json(), or decrypted content in this module.
 */

import { indexedDBJournalRepo } from "@/lib/local/db/journalRepo";
import { indexedDBCheckinsRepo } from "@/lib/local/db/checkinsRepo";
import { indexedDBConversationRepo } from "@/lib/local/db/conversationRepo";
import { indexedDBReportsRepo } from "@/lib/local/db/reportsRepo";
import { getMigrationCursorStore } from "./cursorStore";
import type { LocalJournalRow, LocalCheckinRow, LocalConversationMessageRow, LocalReportRow } from "@/lib/local/db/types";

const PAGE_SIZE = 50;
const ENDPOINTS = {
  journals: "/api/migration/export/journals",
  checkins: "/api/migration/export/checkins",
  conversations: "/api/migration/export/conversations",
  reports: "/api/migration/export/reports",
} as const;

const MIGRATION_COMPLETED_KEY = "vella_local_v2:migration_completed";

function getMigrationCompletedKey(userId: string): string {
  return `${MIGRATION_COMPLETED_KEY}:${userId}`;
}

export function isMigrationCompleted(userId: string): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  return window.localStorage.getItem(getMigrationCompletedKey(userId)) === "true";
}

export function setLocalMigrationCompleted(userId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(getMigrationCompletedKey(userId), "true");
}

export type ImportProgress = {
  table: string;
  status: "pending" | "in_progress" | "done";
  last_offset?: number;
};

export type RunImportPipelineResult = { ok: true } | { ok: false; error: string };

export async function runImportPipeline(
  userId: string,
  onProgress?: (progress: ImportProgress) => void
): Promise<RunImportPipelineResult> {
  const startRes = await fetch("/api/migration/start", { method: "POST", credentials: "include" });
  if (!startRes.ok) {
    const body = await startRes.json().catch(() => ({}));
    const code = (body?.error?.code as string) ?? "start_failed";
    return { ok: false, error: code === "MIGRATION_ALREADY_COMPLETED" ? "already_completed" : "start_failed" };
  }
  const startJson = await startRes.json();
  const migrationToken = (startJson.migration_token as string) ?? "";
  if (!migrationToken) return { ok: false, error: "start_failed" };

  const exportHeaders: Record<string, string> = {
    "X-Migration-Token": migrationToken,
  };

  const cursorStore = getMigrationCursorStore();
  const tables = ["journals", "checkins", "conversations", "reports"] as const;

  for (const table of tables) {
    onProgress?.({ table, status: "in_progress" });
    let cursor = await cursorStore.get(userId, table);
    let offset = cursor?.last_offset ?? 0;
    let completed = cursor?.completed ?? false;

    while (!completed) {
      const url = `${ENDPOINTS[table]}?offset=${offset}&limit=${PAGE_SIZE}`;
      const res = await fetch(url, { credentials: "include", headers: exportHeaders });
      if (res.status === 410) {
        await cursorStore.set(userId, table, { last_offset: 0, completed: true });
        completed = true;
        continue;
      }
      if (!res.ok) {
        return { ok: false, error: `export_${table}_${res.status}` };
      }
      const json = await res.json();
      const data = (json.data ?? []) as Record<string, unknown>[];
      const hasMore = json.has_more === true;

      for (const row of data) {
        const id = (row.id as string) ?? "";
        if (table === "journals") {
          await indexedDBJournalRepo.upsertByLegacyId(userId, {
            legacy_id: id,
            title: (row.title as string | null) ?? null,
            content: (row.content as string) ?? "",
            created_at: (row.created_at as string) ?? "",
            updated_at: (row.updated_at as string) ?? "",
          } as LocalJournalRow);
        } else if (table === "checkins") {
          await indexedDBCheckinsRepo.upsertByLegacyId(userId, {
            legacy_id: id,
            entry_date: (row.entry_date as string) ?? "",
            mood: (row.mood as number) ?? 0,
            stress: (row.stress as number) ?? 0,
            energy: (row.energy as number) ?? 0,
            focus: (row.focus as number) ?? 0,
            note: (row.note as string | null) ?? null,
            created_at: (row.created_at as string) ?? "",
          } as LocalCheckinRow);
        } else if (table === "conversations") {
          await indexedDBConversationRepo.upsertByLegacyId(userId, {
            legacy_id: id,
            session_id: (row.session_id as string | null) ?? null,
            role: (row.role as "user" | "assistant") ?? "user",
            content: (row.content as string) ?? "",
            created_at: (row.created_at as string) ?? "",
          } as LocalConversationMessageRow);
        } else if (table === "reports") {
          await indexedDBReportsRepo.upsertByLegacyId(userId, {
            legacy_id: id,
            type: (row.type as string) ?? "",
            severity: (row.severity as number) ?? 0,
            status: (row.status as string) ?? "open",
            summary: (row.summary as string | null) ?? null,
            notes: (row.notes as string | null) ?? null,
            created_at: (row.created_at as string) ?? "",
            updated_at: (row.updated_at as string) ?? "",
          } as LocalReportRow);
        }
      }
      offset += data.length;
      await cursorStore.set(userId, table, { last_offset: offset, completed: !hasMore });
      onProgress?.({ table, status: "in_progress", last_offset: offset });
      if (!hasMore) break;
    }
    onProgress?.({ table, status: "done" });
  }

  const completeRes = await fetch("/api/migration/complete", { method: "POST", credentials: "include" });
  if (!completeRes.ok) {
    return { ok: false, error: "complete_failed" };
  }
  setLocalMigrationCompleted(userId);
  return { ok: true };
}
