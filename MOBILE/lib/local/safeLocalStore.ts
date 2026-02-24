// MOBILE/lib/local/safeLocalStore.ts
// Tiny wrapper around localStorage with JSON + namespacing.
// All sensitive content lives behind this layer.

const NAMESPACE = "vella_local_v1";

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function key(path: string) {
  return `${NAMESPACE}:${path}`;
}

export function readLocalJSON<T>(path: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key(path));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalJSON(path: string, value: unknown): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key(path), JSON.stringify(value));
  } catch {
    // Best-effort; ignore quota errors etc.
  }
}

export function removeLocal(path: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(key(path));
  } catch {
    // ignore
  }
}

