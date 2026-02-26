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

import { addItem, listItems, inboxIdempotencyKey } from "@/lib/local/db/inboxRepo";

const USER = "user-catchup-test";
const CID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

beforeEach(() => {
  mockStore = {};
});

// ---------------------------------------------------------------------------
// Catch-up idempotency key format
// ---------------------------------------------------------------------------

describe("missed_window catch-up idempotency", () => {
  it("missed_window key includes commitment_id + window_end to prevent duplicates", () => {
    const windowEndIso = "2026-02-23T23:59:59.999Z";
    const missedKey = `${CID}::missed::${windowEndIso}`;

    // Key format is deterministic
    expect(missedKey).toBe(`${CID}::missed::${windowEndIso}`);
    // Different from normal inbox key
    const normalKey = inboxIdempotencyKey(CID, "2026-02-23T00:00:00.000Z");
    expect(missedKey).not.toBe(normalKey);
  });

  it("creating missed_window item with same key twice does not duplicate", async () => {
    const windowEndIso = "2026-02-23T23:59:59.999Z";
    const missedKey = `${CID}::missed::${windowEndIso}`;

    const item: InboxItem = {
      id: missedKey,
      created_at: new Date().toISOString(),
      commitment_id: CID,
      domain_code: "fitness",
      template_code: "missed_window",
      window_start_iso: "2026-02-23T00:00:00.000Z",
      window_end_iso: windowEndIso,
      status: "unread",
    };

    await addItem(USER, item);
    await addItem(USER, item); // idempotent upsert

    const items = await listItems(USER);
    expect(items).toHaveLength(1);
    expect(items[0].template_code).toBe("missed_window");
    expect(items[0].id).toBe(missedKey);
  });

  it("missed_window and window_open for same commitment are separate items", async () => {
    const windowStartIso = "2026-02-23T00:00:00.000Z";
    const windowEndIso = "2026-02-23T23:59:59.999Z";
    const missedKey = `${CID}::missed::${windowEndIso}`;
    const openKey = inboxIdempotencyKey(CID, windowStartIso);

    await addItem(USER, {
      id: openKey,
      created_at: "2026-02-23T08:00:00Z",
      commitment_id: CID,
      domain_code: "fitness",
      template_code: "window_open",
      window_start_iso: windowStartIso,
      status: "done",
    });

    await addItem(USER, {
      id: missedKey,
      created_at: "2026-02-24T08:00:00Z",
      commitment_id: CID,
      domain_code: "fitness",
      template_code: "missed_window",
      window_start_iso: windowStartIso,
      window_end_iso: windowEndIso,
      status: "unread",
    });

    const items = await listItems(USER);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.template_code === "missed_window")).toBeDefined();
    expect(items.find((i) => i.template_code === "window_open")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Catch-up creates missed_window only once
// ---------------------------------------------------------------------------

describe("catch-up creates missed_window once", () => {
  it("simulating catch-up: only creates if key not in existing set", async () => {
    const windowEndIso = "2026-02-23T23:59:59.999Z";
    const missedKey = `${CID}::missed::${windowEndIso}`;

    // Simulate first catch-up pass
    const existingBefore = await listItems(USER);
    const existingIds = new Set(existingBefore.map((i) => i.id));

    if (!existingIds.has(missedKey)) {
      await addItem(USER, {
        id: missedKey,
        created_at: new Date().toISOString(),
        commitment_id: CID,
        domain_code: "fitness",
        template_code: "missed_window",
        window_start_iso: "2026-02-23T00:00:00.000Z",
        window_end_iso: windowEndIso,
        status: "unread",
      });
    }

    expect(await listItems(USER)).toHaveLength(1);

    // Simulate second catch-up pass — should NOT create another
    const existingAfter = await listItems(USER);
    const existingIdsAfter = new Set(existingAfter.map((i) => i.id));

    if (!existingIdsAfter.has(missedKey)) {
      await addItem(USER, {
        id: missedKey,
        created_at: new Date().toISOString(),
        commitment_id: CID,
        domain_code: "fitness",
        template_code: "missed_window",
        window_start_iso: "2026-02-23T00:00:00.000Z",
        window_end_iso: windowEndIso,
        status: "unread",
      });
    }

    // Still only 1 item
    expect(await listItems(USER)).toHaveLength(1);
  });
});
