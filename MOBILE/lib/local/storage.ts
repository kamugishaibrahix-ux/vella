import { readLocalJSON, writeLocalJSON, removeLocal as removeLocalEntry } from "./safeLocalStore";

export function loadLocal<T = unknown>(key: string, fallback: T | null = null): T | null {
  return readLocalJSON<T | null>(key, fallback);
}

export function saveLocal<T>(key: string, value: T): void {
  writeLocalJSON(key, value);
}

export function removeLocal(key: string): void {
  removeLocalEntry(key);
}

