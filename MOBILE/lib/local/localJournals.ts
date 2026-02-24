import { v4 as uuid } from "uuid";

import { listItems, loadItem, removeItem, saveItem } from "./safeStorage";

const JOURNAL_NS = "journal" as const;

export interface LocalJournalEntry {
  id: string;
  title?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export function createLocalJournal(content: string, title?: string | null) {
  const now = new Date().toISOString();
  const entry: LocalJournalEntry = {
    id: uuid(),
    title: title ?? null,
    content,
    createdAt: now,
    updatedAt: now,
  };
  saveItem(JOURNAL_NS, entry.id, entry);
  return entry;
}

export function updateLocalJournal(
  id: string,
  patch: Partial<Pick<LocalJournalEntry, "title" | "content">>,
) {
  const existing = loadItem<LocalJournalEntry>(JOURNAL_NS, id);
  if (!existing) return null;
  const next: LocalJournalEntry = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveItem(JOURNAL_NS, id, next);
  return next;
}

export function getLocalJournal(id: string) {
  return loadItem<LocalJournalEntry>(JOURNAL_NS, id);
}

export function listLocalJournals(): LocalJournalEntry[] {
  const all = listItems<LocalJournalEntry>(JOURNAL_NS);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function deleteLocalJournal(id: string) {
  removeItem(JOURNAL_NS, id);
}

