import { describe, it, expect, vi, beforeEach } from "vitest";
import { inboxIdempotencyKey } from "@/lib/local/db/inboxRepo";
import type { InboxItem } from "@/lib/execution/types";

// ---------------------------------------------------------------------------
// Mock IndexedDB helpers — in-memory Map simulating a key-value object store
// ---------------------------------------------------------------------------

const store = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/local/db/indexedDB", () => ({
  put: vi.fn((_storeName: string, value: Record<string, unknown>) => {
    store.set(value.id as string, { ...value });
    return Promise.resolve();
  }),
  getByKey: vi.fn((_storeName: string, id: string) => {
    return Promise.resolve(store.get(id) ?? null);
  }),
  getAllByIndex: vi.fn((_storeName: string, _indexName: string, userId: string) => {
    return Promise.resolve(
      Array.from(store.values()).filter((v) => v.userId === userId)
    );
  }),
  remove: vi.fn((_storeName: string, id: string) => {
    store.delete(id);
    return Promise.resolve();
  }),
  STORES: ["journals", "checkins", "conversations", "reports", "migration_cursors", "commitments_local", "inbox_items"],
}));

// vi.mock is hoisted above imports by vitest, so static import works here
import { addItem, listItems } from "@/lib/local/db/inboxRepo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = "11111111-2222-3333-4444-555555555555";
const COMMITMENT_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const WINDOW_1 = "2026-02-24T00:00:00.000Z";
const WINDOW_2 = "2026-02-25T00:00:00.000Z";

function makeInboxItem(commitmentId: string, windowStartIso: string): InboxItem {
  return {
    id: inboxIdempotencyKey(commitmentId, windowStartIso),
    created_at: new Date().toISOString(),
    commitment_id: commitmentId,
    domain_code: "fitness",
    template_code: "window_open",
    window_start_iso: windowStartIso,
    status: "unread",
  };
}

beforeEach(() => {
  store.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("inbox IndexedDB idempotency", () => {
  it("creates same item twice → store still has 1 record", async () => {
    const item = makeInboxItem(COMMITMENT_A, WINDOW_1);

    await addItem(USER_ID, item);
    await addItem(USER_ID, item);

    const items = await listItems(USER_ID);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(inboxIdempotencyKey(COMMITMENT_A, WINDOW_1));
  });

  it("creates two different windows → store has 2 records", async () => {
    const item1 = makeInboxItem(COMMITMENT_A, WINDOW_1);
    const item2 = makeInboxItem(COMMITMENT_A, WINDOW_2);

    await addItem(USER_ID, item1);
    await addItem(USER_ID, item2);

    const items = await listItems(USER_ID);
    expect(items).toHaveLength(2);

    const ids = items.map((i) => i.id).sort();
    expect(ids).toEqual([
      inboxIdempotencyKey(COMMITMENT_A, WINDOW_1),
      inboxIdempotencyKey(COMMITMENT_A, WINDOW_2),
    ].sort());
  });

  it("idempotency key equals commitment_id::window_start_iso", () => {
    const key = inboxIdempotencyKey(COMMITMENT_A, WINDOW_1);
    expect(key).toBe(`${COMMITMENT_A}::${WINDOW_1}`);
  });

  it("upsert preserves latest write (does not duplicate)", async () => {
    const item = makeInboxItem(COMMITMENT_A, WINDOW_1);
    await addItem(USER_ID, item);

    // Second write with updated created_at
    const updated = { ...item, created_at: "2026-02-24T12:00:00.000Z" };
    await addItem(USER_ID, updated);

    const items = await listItems(USER_ID);
    expect(items).toHaveLength(1);
    expect(items[0].created_at).toBe("2026-02-24T12:00:00.000Z");
  });
});
