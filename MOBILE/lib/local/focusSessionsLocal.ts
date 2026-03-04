/**
 * Local Focus Session Store (IndexedDB).
 * Client-only, no Supabase. Mirrors focus_sessions for local-mode insights.
 * Dedicated DB to avoid touching shared vella_local_v2 schema.
 */

const DB_NAME = "vella_focus_sessions_v1";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

export interface LocalFocusSession {
  id: string;
  started_at: string;
  ended_at?: string | null;
  completed: boolean;
}

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("started_at", "started_at", { unique: false });
      }
    };
  });
}

async function withDB<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export async function addFocusSessionLocal(session: Omit<LocalFocusSession, "id"> & { id?: string }): Promise<void> {
  if (typeof window === "undefined") return;
  const row: LocalFocusSession = {
    id: session.id ?? crypto.randomUUID(),
    started_at: session.started_at,
    ended_at: session.ended_at ?? null,
    completed: session.completed,
  };
  await withDB<void>((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

async function getSessionsSince(sinceIso: string): Promise<LocalFocusSession[]> {
  if (typeof window === "undefined") return [];
  return withDB((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("started_at");
      const range = IDBKeyRange.lowerBound(sinceIso);
      const req = index.getAll(range);
      req.onsuccess = () => resolve((req.result ?? []) as LocalFocusSession[]);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getFocusSessionsLast7d(): Promise<LocalFocusSession[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return getSessionsSince(since);
}

export async function getFocusSessionsLast30d(): Promise<LocalFocusSession[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return getSessionsSince(since);
}
