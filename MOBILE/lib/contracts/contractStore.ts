/**
 * Contract Store - Local-first IndexedDB storage for execution contracts
 * No remote storage of contract text per privacy requirements
 * Uses native IndexedDB API (no external dependencies)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContractStatus = "pending" | "active" | "completed" | "violated" | "expired";
export type ContractType = "time_block" | "outcome" | "rule";

export interface Contract {
  id: string;
  title: string;
  type: ContractType;
  startTime: number; // unix ms
  endTime: number; // unix ms
  status: ContractStatus;
  recurrence?: "none" | "daily";
  createdAt: number;
  completedAt?: number;
  violatedAt?: number;
}

// ---------------------------------------------------------------------------
// IndexedDB Setup
// ---------------------------------------------------------------------------

const DB_NAME = "vella-contracts";
const DB_VERSION = 1;
const STORE_NAME = "contracts";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-status", "status", { unique: false });
        store.createIndex("by-time", "startTime", { unique: false });
      }
    };
  });
}

function withStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      resolve(store);
    } catch (error) {
      reject(error);
    }
  });
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

export async function saveContract(contract: Contract): Promise<void> {
  const store = await withStore("readwrite");
  return new Promise((resolve, reject) => {
    const request = store.put(contract);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getContract(id: string): Promise<Contract | undefined> {
  const store = await withStore("readonly");
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllContracts(): Promise<Contract[]> {
  const store = await withStore("readonly");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getContractsByStatus(status: ContractStatus): Promise<Contract[]> {
  const store = await withStore("readonly");
  return new Promise((resolve, reject) => {
    const index = store.index("by-status");
    const request = index.getAll(status);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteContract(id: string): Promise<void> {
  const store = await withStore("readwrite");
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateContractStatus(
  id: string,
  status: ContractStatus,
  timestamp?: number
): Promise<void> {
  const contract = await getContract(id);
  if (!contract) return;

  contract.status = status;
  if (status === "completed" && timestamp) {
    contract.completedAt = timestamp;
  } else if (status === "violated" && timestamp) {
    contract.violatedAt = timestamp;
  }

  await saveContract(contract);
}

// ---------------------------------------------------------------------------
// Query Helpers
// ---------------------------------------------------------------------------

export async function getActiveContract(): Promise<Contract | null> {
  const now = Date.now();
  const all = await getAllContracts();

  // Find the first active contract (time-based currently running)
  const active = all.find(
    (c) =>
      c.status === "active" ||
      (c.status === "pending" && c.startTime <= now && c.endTime >= now)
  );

  return active || null;
}

export async function getTodaysContracts(): Promise<Contract[]> {
  const now = Date.now();
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const endOfDay = new Date().setHours(23, 59, 59, 999);

  const all = await getAllContracts();
  return all.filter(
    (c) =>
      (c.startTime >= startOfDay && c.startTime <= endOfDay) ||
      (c.endTime >= startOfDay && c.endTime <= endOfDay) ||
      (c.startTime <= startOfDay && c.endTime >= endOfDay)
  );
}

export async function cleanupExpiredContracts(): Promise<void> {
  const now = Date.now();
  const all = await getAllContracts();

  for (const contract of all) {
    if (
      contract.status === "pending" &&
      contract.endTime < now
    ) {
      await updateContractStatus(contract.id, "expired");
    }
  }
}
