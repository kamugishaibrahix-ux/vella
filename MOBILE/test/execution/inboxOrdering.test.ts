import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InboxItem } from "@/lib/execution/types";

// ---------------------------------------------------------------------------
// Mock IndexedDB layer
// ---------------------------------------------------------------------------

let mockStore: Record<string, Record<string, unknown>> = {};

vi.mock("@/lib/local/db/indexedDB", () => ({
  put: vi.fn(async (_store: string, value: Record<string, unknown>) => {
    const store = _store as string;
    if (!mockStore[store]) mockStore[store] = {};
    mockStore[store][(value as { id: string }).id] = value;
  }),
  getByKey: vi.fn(async (_store: string, id: string) => {
    const store = _store as string;
    return mockStore[store]?.[id] ?? null;
  }),
  getAllByIndex: vi.fn(async (_store: string, _index: string, userId: string) => {
    const store = _store as string;
    return Object.values(mockStore[store] ?? {}).filter(
      (r: any) => r.userId === userId
    );
  }),
  remove: vi.fn(async (_store: string, id: string) => {
    const store = _store as string;
    if (mockStore[store]) delete mockStore[store][id];
  }),
  STORES: ["journals", "checkins", "conversations", "reports", "migration_cursors", "commitments_local", "inbox_items"],
}));

import {
  addItem,
  listItems,
  markDone,
  snoozeItem,
  skipItem,
  deleteItemById,
  inboxIdempotencyKey,
} from "@/lib/local/db/inboxRepo";

const USER = "user-test-123";
const CID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

beforeEach(() => {
  mockStore = {};
});

function makeItem(overrides: Partial<InboxItem> & { id: string }): InboxItem {
  return {
    created_at: new Date().toISOString(),
    commitment_id: CID,
    domain_code: "fitness",
    template_code: "window_open",
    window_start_iso: "2026-02-24T00:00:00.000Z",
    status: "unread",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

describe("inbox item ordering", () => {
  it("lists items newest first", async () => {
    await addItem(USER, makeItem({ id: "a", created_at: "2026-02-24T08:00:00Z" }));
    await addItem(USER, makeItem({ id: "b", created_at: "2026-02-24T10:00:00Z" }));
    await addItem(USER, makeItem({ id: "c", created_at: "2026-02-24T06:00:00Z" }));

    const items = await listItems(USER);
    expect(items.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("idempotent: adding same id twice keeps one record", async () => {
    const item = makeItem({ id: "x" });
    await addItem(USER, item);
    await addItem(USER, { ...item, status: "done" });

    const items = await listItems(USER);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("done"); // last write wins (put upsert)
  });
});

// ---------------------------------------------------------------------------
// Snooze
// ---------------------------------------------------------------------------

describe("inbox snooze", () => {
  it("sets status to snoozed with snooze_until", async () => {
    await addItem(USER, makeItem({ id: "s1" }));
    const snoozeUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    await snoozeItem("s1", snoozeUntil);

    const items = await listItems(USER);
    expect(items[0].status).toBe("snoozed");
    expect(items[0].snooze_until).toBe(snoozeUntil);
  });

  it("snooze is a no-op for non-existent item", async () => {
    await snoozeItem("nonexistent", new Date().toISOString());
    // No error thrown
  });
});

// ---------------------------------------------------------------------------
// Skip
// ---------------------------------------------------------------------------

describe("inbox skip", () => {
  it("sets status to skipped", async () => {
    await addItem(USER, makeItem({ id: "sk1" }));
    await skipItem("sk1");

    const items = await listItems(USER);
    expect(items[0].status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// Mark done
// ---------------------------------------------------------------------------

describe("inbox markDone", () => {
  it("sets status to done", async () => {
    const windowIso = "2026-02-24T00:00:00.000Z";
    const id = inboxIdempotencyKey(CID, windowIso);
    await addItem(USER, makeItem({ id, window_start_iso: windowIso }));
    await markDone(CID, windowIso);

    const items = await listItems(USER);
    expect(items[0].status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe("inbox delete", () => {
  it("removes the item", async () => {
    await addItem(USER, makeItem({ id: "d1" }));
    expect(await listItems(USER)).toHaveLength(1);
    await deleteItemById("d1");
    expect(await listItems(USER)).toHaveLength(0);
  });
});
