/**
 * Phase 2.1: IndexedDB-backed inbox repository.
 * Local-only queue for trigger-fired inbox items.
 * No encryption needed — all fields are enum/code values, no free-text.
 */

import { put, getAllByIndex, getByKey, remove } from "./indexedDB";
import type { InboxItem } from "@/lib/execution/types";

const STORE = "inbox_items" as const;

/**
 * Build the idempotency key for an inbox item.
 * `id = ${commitment_id}::${window_start_iso}` — one item per window.
 */
export function inboxIdempotencyKey(commitmentId: string, windowStartIso: string): string {
  return `${commitmentId}::${windowStartIso}`;
}

/**
 * Add an inbox item. Caller MUST set `item.id = inboxIdempotencyKey(...)`.
 * Uses `put()` so repeated calls for the same id are an idempotent upsert.
 */
export async function addItem(
  userId: string,
  item: InboxItem
): Promise<void> {
  await put(STORE, { ...item, userId });
}

/**
 * List all inbox items for a user, newest first.
 */
export async function listItems(userId: string): Promise<InboxItem[]> {
  const raw = await getAllByIndex(STORE, "userId", userId);
  const rows = raw as (InboxItem & { userId: string })[];
  return rows
    .map(({ userId: _u, ...rest }) => rest as InboxItem)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * Get a single inbox item by its id.
 */
export async function getById(id: string): Promise<(InboxItem & { userId: string }) | null> {
  const row = await getByKey(STORE, id);
  return (row as (InboxItem & { userId: string }) | null) ?? null;
}

/**
 * Mark an inbox item as "done" by its composite id.
 */
export async function markDone(
  commitmentId: string,
  windowStartIso: string
): Promise<void> {
  const id = inboxIdempotencyKey(commitmentId, windowStartIso);
  const existing = (await getByKey(STORE, id)) as (InboxItem & { userId: string }) | null;
  if (!existing) return;
  await put(STORE, { ...existing, status: "done" });
}

/**
 * Mark an inbox item as "snoozed" with a snooze_until timestamp.
 */
export async function snoozeItem(
  id: string,
  snoozeUntilIso: string
): Promise<void> {
  const existing = (await getByKey(STORE, id)) as (InboxItem & { userId: string }) | null;
  if (!existing) return;
  await put(STORE, { ...existing, status: "snoozed", snooze_until: snoozeUntilIso });
}

/**
 * Mark an inbox item as "skipped".
 */
export async function skipItem(id: string): Promise<void> {
  const existing = (await getByKey(STORE, id)) as (InboxItem & { userId: string }) | null;
  if (!existing) return;
  await put(STORE, { ...existing, status: "skipped" });
}

/**
 * Delete an inbox item by its composite id.
 */
export async function deleteItem(
  commitmentId: string,
  windowStartIso: string
): Promise<void> {
  const id = inboxIdempotencyKey(commitmentId, windowStartIso);
  await remove(STORE, id);
}

/**
 * Delete an inbox item by its id directly.
 */
export async function deleteItemById(id: string): Promise<void> {
  await remove(STORE, id);
}
