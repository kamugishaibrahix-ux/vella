// MOBILE/lib/local/journalLocal.ts
// LOCAL-FIRST CANONICAL STORE — all journal text stays on-device.
// Supabase receives only metadata (id, timestamps, word_count, local_hash, processing_mode).

import { ensureUserId } from "./ensureUserId";
import { loadLocal, saveLocal } from "./storage";
import { indexedDBJournalRepo } from "./db/journalRepo";
import type { OSSignal } from "@/lib/osSignals/taxonomy";
import { extractSignalsFromJournalText } from "@/lib/osSignals/journalSignalExtractor";

export type ProcessingMode = "private" | "signals_only";

export interface LocalJournalEntry {
  id: string;
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  localHash: string;
  processingMode: ProcessingMode;
}

/** Metadata-only payload for server sync (no text, no title). */
export interface JournalMetaPayload {
  id: string;
  created_at: string;
  updated_at: string;
  word_count: number;
  local_hash: string;
  processing_mode: ProcessingMode;
  signals?: OSSignal[];
}

const JOURNAL_PATH = (userId: string) => `journals:${userId}:entries`;

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

export function journalWordCount(text: string): number {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

export async function journalHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// localStorage-backed list (sync, SSR-safe fallback)
// ---------------------------------------------------------------------------

export function listLocalJournals(userId?: string): LocalJournalEntry[] {
  const uid = ensureUserId(userId);
  return loadLocal<LocalJournalEntry[]>(JOURNAL_PATH(uid), []) ?? [];
}

export function getLocalJournal(userId: string | undefined, id: string): LocalJournalEntry | null {
  const uid = ensureUserId(userId);
  const all = listLocalJournals(uid);
  return all.find((j) => j.id === id) ?? null;
}

function persistList(userId: string, entries: LocalJournalEntry[]): void {
  saveLocal(JOURNAL_PATH(userId), entries);
}

// ---------------------------------------------------------------------------
// IndexedDB async accessors (browser only)
// ---------------------------------------------------------------------------

export async function getLocalJournalAsync(userId: string | undefined, id: string): Promise<LocalJournalEntry | null> {
  const uid = ensureUserId(userId);
  if (typeof window === "undefined" || !window.indexedDB) return getLocalJournal(uid, id);
  const row = await indexedDBJournalRepo.get(uid, id);
  if (!row) return null;
  return {
    id: row.legacy_id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wordCount: journalWordCount(row.content),
    localHash: "", // hash computed async when needed
    processingMode: "private",
  };
}

// ---------------------------------------------------------------------------
// Canonical CRUD — text stays local, returns metadata for server sync
// ---------------------------------------------------------------------------

export async function createLocalJournal(
  userId: string | undefined,
  input: { title?: string | null; content: string; processingMode?: ProcessingMode },
): Promise<{ entry: LocalJournalEntry; meta: JournalMetaPayload }> {
  const uid = ensureUserId(userId);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const wc = journalWordCount(input.content);
  const hash = await journalHash(input.content);
  const mode = input.processingMode ?? "private";

  const entry: LocalJournalEntry = {
    id,
    title: input.title ?? null,
    content: input.content,
    createdAt: now,
    updatedAt: now,
    wordCount: wc,
    localHash: hash,
    processingMode: mode,
  };

  // Persist to localStorage list
  const list = listLocalJournals(uid);
  list.unshift(entry);
  persistList(uid, list);

  // Persist to IndexedDB (async, non-blocking)
  if (typeof window !== "undefined" && window.indexedDB) {
    indexedDBJournalRepo.upsertByLegacyId(uid, {
      legacy_id: id,
      title: entry.title,
      content: entry.content,
      created_at: now,
      updated_at: now,
    }).catch(() => { /* silent */ });
  }

  const meta: JournalMetaPayload = {
    id,
    created_at: now,
    updated_at: now,
    word_count: wc,
    local_hash: hash,
    processing_mode: mode,
    ...(mode === "signals_only" ? { signals: extractSignalsFromJournalText(input.content) } : {}),
  };

  return { entry, meta };
}

export async function updateLocalJournal(
  userId: string | undefined,
  id: string,
  patch: { title?: string | null; content?: string; processingMode?: ProcessingMode },
): Promise<{ entry: LocalJournalEntry; meta: JournalMetaPayload } | null> {
  const uid = ensureUserId(userId);
  const list = listLocalJournals(uid);
  const idx = list.findIndex((j) => j.id === id);
  if (idx === -1) return null;

  const existing = list[idx];
  const now = new Date().toISOString();
  const newContent = patch.content ?? existing.content;
  const wc = journalWordCount(newContent);
  const hash = await journalHash(newContent);
  const mode = patch.processingMode ?? existing.processingMode;

  const updated: LocalJournalEntry = {
    ...existing,
    title: patch.title !== undefined ? (patch.title ?? null) : existing.title,
    content: newContent,
    updatedAt: now,
    wordCount: wc,
    localHash: hash,
    processingMode: mode,
  };

  list[idx] = updated;
  persistList(uid, list);

  // IndexedDB mirror
  if (typeof window !== "undefined" && window.indexedDB) {
    indexedDBJournalRepo.upsertByLegacyId(uid, {
      legacy_id: id,
      title: updated.title,
      content: updated.content,
      created_at: updated.createdAt,
      updated_at: now,
    }).catch(() => { /* silent */ });
  }

  const meta: JournalMetaPayload = {
    id,
    created_at: updated.createdAt,
    updated_at: now,
    word_count: wc,
    local_hash: hash,
    processing_mode: mode,
    ...(mode === "signals_only" ? { signals: extractSignalsFromJournalText(newContent) } : {}),
  };

  return { entry: updated, meta };
}

export async function deleteLocalJournal(userId: string | undefined, id: string): Promise<void> {
  const uid = ensureUserId(userId);
  const list = listLocalJournals(uid);
  persistList(uid, list.filter((j) => j.id !== id));
  if (typeof window !== "undefined" && window.indexedDB) {
    await indexedDBJournalRepo.delete(uid, id);
  }
}

