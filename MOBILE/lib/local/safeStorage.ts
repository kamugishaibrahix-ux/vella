// Local-only storage helpers for sensitive data.
// All functions are NO-OP on the server to avoid using `window`.

export type SafeStoreNamespace =
  | "conversation"
  | "journal"
  | "memory"
  | "checkins";

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function makeKey(namespace: SafeStoreNamespace, id: string) {
  return `vella:${namespace}:${id}`;
}

export function saveItem<T>(
  namespace: SafeStoreNamespace,
  id: string,
  value: T,
) {
  const storage = getStorage();
  if (!storage) return;
  const key = makeKey(namespace, id);
  const payload = JSON.stringify({
    v: 1,
    savedAt: Date.now(),
    data: value,
  });
  storage.setItem(key, payload);
}

export function loadItem<T>(
  namespace: SafeStoreNamespace,
  id: string,
): T | null {
  const storage = getStorage();
  if (!storage) return null;
  const key = makeKey(namespace, id);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v: number; data: T };
    return parsed.data;
  } catch {
    return null;
  }
}

export function listItems<T>(namespace: SafeStoreNamespace): T[] {
  const storage = getStorage();
  if (!storage) return [];
  const prefix = `vella:${namespace}:`;
  const results: T[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { v: number; data: T };
      results.push(parsed.data);
    } catch {
      // ignore
    }
  }
  return results;
}

export function removeItem(namespace: SafeStoreNamespace, id: string) {
  const storage = getStorage();
  if (!storage) return;
  const key = makeKey(namespace, id);
  storage.removeItem(key);
}

