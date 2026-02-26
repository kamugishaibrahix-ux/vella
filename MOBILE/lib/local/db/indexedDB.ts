/**
 * Phase M3: IndexedDB open and helpers.
 * One DB vella_local_v2 with stores: journals, checkins, conversations, reports, migration_cursors.
 */

const DB_NAME = "vella_local_v2";
const DB_VERSION = 4;
const STORES = ["journals", "checkins", "conversations", "reports", "migration_cursors", "commitments_local", "inbox_items"] as const;

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
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          if (name !== "migration_cursors") store.createIndex("userId", "userId", { unique: false });
          if (name === "inbox_items") store.createIndex("commitment_id", "commitment_id", { unique: false });
        }
      }
      // v4: add commitment_id index to inbox_items if upgrading from v3
      if (db.objectStoreNames.contains("inbox_items")) {
        const tx = req.transaction!;
        const store = tx.objectStore("inbox_items");
        if (!store.indexNames.contains("commitment_id")) {
          store.createIndex("commitment_id", "commitment_id", { unique: false });
        }
      }
    };
  });
}

type StoreName = (typeof STORES)[number];

export async function withDB<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDB();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export async function getByKey(storeName: StoreName, id: string): Promise<unknown | null> {
  return withDB((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function put(storeName: StoreName, value: Record<string, unknown>): Promise<void> {
  return withDB((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export async function remove(storeName: StoreName, id: string): Promise<void> {
  return withDB((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getAllByIndex(
  storeName: StoreName,
  indexName: string,
  userId: string
): Promise<unknown[]> {
  return withDB((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const range = IDBKeyRange.only(userId);
      const req = index.getAll(range);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  });
}

export { STORES };
export type { StoreName };
