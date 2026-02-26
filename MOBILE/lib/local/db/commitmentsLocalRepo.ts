/**
 * Execution Spine — Local encrypted commitment companion records.
 * Stores description, motivation, notes in IndexedDB with AES-256-GCM encryption.
 * Keyed by commitment_id. UI still works if local record is missing.
 */

import { put, getByKey, getAllByIndex, remove } from "./indexedDB";
import { encryptString, decryptString } from "../encryption/crypto";
import type { EncryptResult } from "../encryption/types";

const STORE = "commitments_local" as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommitmentLocalRecord = {
  id: string; // commitment_id (PK)
  userId: string;
  description: EncryptResult;
  motivation: EncryptResult | null;
  notes: EncryptResult | null;
  created_at: string;
  updated_at: string;
};

export type CommitmentLocalDecrypted = {
  id: string;
  userId: string;
  description: string;
  motivation: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// AAD builder (prevents ciphertext swapping between records/fields)
// ---------------------------------------------------------------------------

function aad(userId: string, commitmentId: string, field: string): string {
  return `${userId}:${commitmentId}:${field}`;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export async function saveCommitmentLocal(
  userId: string,
  commitmentId: string,
  description: string,
  motivation?: string | null,
  notes?: string | null
): Promise<void> {
  const now = new Date().toISOString();
  const descEnc = await encryptString(description, aad(userId, commitmentId, "description"));
  const motEnc = motivation
    ? await encryptString(motivation, aad(userId, commitmentId, "motivation"))
    : null;
  const notesEnc = notes
    ? await encryptString(notes, aad(userId, commitmentId, "notes"))
    : null;

  const record: CommitmentLocalRecord = {
    id: commitmentId,
    userId,
    description: descEnc,
    motivation: motEnc,
    notes: notesEnc,
    created_at: now,
    updated_at: now,
  };

  await put(STORE, record as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Get single (decrypted)
// ---------------------------------------------------------------------------

export async function getCommitmentLocal(
  userId: string,
  commitmentId: string
): Promise<CommitmentLocalDecrypted | null> {
  const raw = (await getByKey(STORE, commitmentId)) as CommitmentLocalRecord | null;
  if (!raw || raw.userId !== userId) return null;

  try {
    const description = await decryptString(raw.description, aad(userId, commitmentId, "description"));
    const motivation = raw.motivation
      ? await decryptString(raw.motivation, aad(userId, commitmentId, "motivation"))
      : null;
    const notes = raw.notes
      ? await decryptString(raw.notes, aad(userId, commitmentId, "notes"))
      : null;

    return {
      id: raw.id,
      userId: raw.userId,
      description,
      motivation,
      notes,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Get all for user (decrypted)
// ---------------------------------------------------------------------------

export async function getAllCommitmentsLocal(
  userId: string
): Promise<CommitmentLocalDecrypted[]> {
  const rawList = (await getAllByIndex(STORE, "userId", userId)) as CommitmentLocalRecord[];
  const results: CommitmentLocalDecrypted[] = [];

  for (const raw of rawList) {
    try {
      const description = await decryptString(raw.description, aad(userId, raw.id, "description"));
      const motivation = raw.motivation
        ? await decryptString(raw.motivation, aad(userId, raw.id, "motivation"))
        : null;
      const notes = raw.notes
        ? await decryptString(raw.notes, aad(userId, raw.id, "notes"))
        : null;

      results.push({
        id: raw.id,
        userId: raw.userId,
        description,
        motivation,
        notes,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
      });
    } catch {
      // Skip records that fail decryption (key rotated, corrupted)
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteCommitmentLocal(commitmentId: string): Promise<void> {
  await remove(STORE, commitmentId);
}
