import { v4 as uuid } from "uuid";

import { listItems, saveItem } from "./safeStorage";

const CHECKINS_NS = "checkins" as const;

export interface LocalCheckinNote {
  id: string;
  note: string;
  createdAt: string;
}

export function saveLocalCheckinNote(note: string) {
  const entry: LocalCheckinNote = {
    id: uuid(),
    note,
    createdAt: new Date().toISOString(),
  };
  saveItem(CHECKINS_NS, entry.id, entry);
  return entry;
}

export function listLocalCheckinNotes(): LocalCheckinNote[] {
  const all = listItems<LocalCheckinNote>(CHECKINS_NS);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

