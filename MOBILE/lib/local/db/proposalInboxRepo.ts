/**
 * IndexedDB-backed proposal inbox repository.
 * Stores proposal_ready items locally. No free text.
 * Uses the same "inbox_items" store as the commitment inbox,
 * discriminated by the `type` field.
 */

import { put, getAllByIndex, getByKey, remove } from "./indexedDB";
import type { ProposalInboxItem } from "@/lib/execution/types";

const STORE = "inbox_items" as const;

/**
 * Add a proposal inbox item (idempotent upsert by id).
 */
export async function addProposalItem(
  userId: string,
  item: ProposalInboxItem,
): Promise<void> {
  await put(STORE, { ...item, userId });
}

/**
 * List all proposal_ready inbox items for a user, newest first.
 */
export async function listProposalItems(userId: string): Promise<ProposalInboxItem[]> {
  const raw = await getAllByIndex(STORE, "userId", userId);
  const rows = raw as (Record<string, unknown>)[];
  return rows
    .filter((r) => r.type === "proposal_ready")
    .map(({ userId: _u, ...rest }) => rest as unknown as ProposalInboxItem)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Check if a pending proposal exists for the given domain created within the
 * specified time window (default 72h). Used for dedupe.
 */
export async function hasPendingProposalForDomain(
  userId: string,
  domain: string,
  withinMs: number = 72 * 60 * 60 * 1000,
  now?: string,
): Promise<boolean> {
  const items = await listProposalItems(userId);
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const cutoff = nowMs - withinMs;

  return items.some(
    (item) =>
      item.domain === domain &&
      item.status === "pending" &&
      new Date(item.created_at).getTime() >= cutoff,
  );
}

/**
 * Get a single proposal inbox item by id.
 */
export async function getProposalById(
  id: string,
): Promise<(ProposalInboxItem & { userId: string }) | null> {
  const row = await getByKey(STORE, id);
  return (row as (ProposalInboxItem & { userId: string }) | null) ?? null;
}

/**
 * Update a proposal item's status (e.g. confirmed, dismissed).
 */
export async function updateProposalStatus(
  id: string,
  status: ProposalInboxItem["status"],
): Promise<void> {
  const existing = await getByKey(STORE, id) as (ProposalInboxItem & { userId: string }) | null;
  if (!existing) return;
  await put(STORE, { ...existing, status });
}

/**
 * Delete a proposal inbox item by id.
 */
export async function deleteProposalItem(id: string): Promise<void> {
  await remove(STORE, id);
}
