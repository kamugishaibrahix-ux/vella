// Local storage for memory snapshots (previously stored in Supabase memory_snapshots table)
import { loadLocal, saveLocal } from "./storage";
import { ensureUserId } from "./ensureUserId";

export interface LocalMemorySnapshot {
  id: string;
  snapshot: unknown;
  createdAt: string;
}

const PATH = (userId: string) => `memory_snapshots:${userId}:snapshots`;

export function saveLocalMemorySnapshot(userId: string | undefined, snapshot: unknown) {
  const uid = ensureUserId(userId);
  const all = loadLocal<LocalMemorySnapshot[]>(PATH(uid), []) ?? [];
  const now = new Date().toISOString();
  all.push({
    id: crypto.randomUUID(),
    snapshot,
    createdAt: now,
  });
  saveLocal(PATH(uid), all);
}

export function listLocalMemorySnapshots(userId: string | undefined, limit = 5): LocalMemorySnapshot[] {
  const uid = ensureUserId(userId);
  const all = loadLocal<LocalMemorySnapshot[]>(PATH(uid), []) ?? [];
  return all
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

