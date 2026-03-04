/**
 * Local Behaviour Event Store (IndexedDB).
 * Client-only, no Supabase. Mirrors behaviour_events for local-mode insights.
 * Append-only store using a dedicated DB to avoid touching shared vella_local_v2 schema.
 */

const DB_NAME = "vella_behaviour_events_v1";
const DB_VERSION = 1;
const STORE_NAME = "events";

export interface LocalBehaviourEvent {
  id: string;
  event_type: string;
  subject_code?: string | null;
  occurred_at: string;
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
        store.createIndex("occurred_at", "occurred_at", { unique: false });
        store.createIndex("event_type", "event_type", { unique: false });
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

export async function addLocalBehaviourEvent(
  event: Omit<LocalBehaviourEvent, "id"> & { id?: string }
): Promise<void> {
  if (typeof window === "undefined") return;
  const row: LocalBehaviourEvent = {
    id: event.id ?? crypto.randomUUID(),
    event_type: event.event_type,
    subject_code: event.subject_code ?? null,
    occurred_at: event.occurred_at ?? new Date().toISOString(),
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

async function getEventsSince(sinceIso: string): Promise<LocalBehaviourEvent[]> {
  if (typeof window === "undefined") return [];
  return withDB((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("occurred_at");
      const range = IDBKeyRange.lowerBound(sinceIso);
      const req = index.getAll(range);
      req.onsuccess = () => resolve((req.result ?? []) as LocalBehaviourEvent[]);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getLocalEventsLast7d(): Promise<LocalBehaviourEvent[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return getEventsSince(since);
}

export async function getLocalEventsLast30d(): Promise<LocalBehaviourEvent[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return getEventsSince(since);
}

export async function getAllLocalEvents(): Promise<LocalBehaviourEvent[]> {
  if (typeof window === "undefined") return [];
  return withDB((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result ?? []) as LocalBehaviourEvent[]);
      req.onerror = () => reject(req.error);
    });
  });
}
