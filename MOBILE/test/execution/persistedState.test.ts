import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getLocalDayKey,
  loadExecutionState,
  saveExecutionState,
  resetIfNewLocalDay,
  buildFiredIdempotencyKey,
  buildSuppressedIdempotencyKey,
  type ExecutionState,
} from "@/lib/execution/persistedState";

const STORAGE_KEY = "vella_execution_state_v1";

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

let storage: Record<string, string> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
    },
  });
});

// ---------------------------------------------------------------------------
// getLocalDayKey
// ---------------------------------------------------------------------------

describe("getLocalDayKey", () => {
  it("returns local day, not UTC", () => {
    // 2026-02-24T23:30:00 UTC — in UTC-8 this is still Feb 24
    // but in UTC it's Feb 24, so let's test a case where UTC day differs from local
    // Create a date that is Feb 25 in UTC but Feb 24 in UTC-8
    // Feb 25 00:30 UTC = Feb 24 16:30 PST
    const d = new Date("2026-02-25T00:30:00Z");

    // getLocalDayKey uses getFullYear/getMonth/getDate which are LOCAL
    // In test (jsdom), TZ is usually UTC, so we verify the format at minimum
    const key = getLocalDayKey(d);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Verify it uses local Date methods, not toISOString
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(key).toBe(expected);
  });

  it("does NOT use toISOString (which returns UTC)", () => {
    const d = new Date(2026, 0, 15); // Jan 15 local
    const key = getLocalDayKey(d);
    expect(key).toBe("2026-01-15");
  });
});

// ---------------------------------------------------------------------------
// loadExecutionState / saveExecutionState
// ---------------------------------------------------------------------------

describe("loadExecutionState", () => {
  it("returns empty state when nothing stored", () => {
    const now = new Date(2026, 1, 24);
    const state = loadExecutionState(now);
    expect(state.dayKey).toBe("2026-02-24");
    expect(state.triggerCountToday).toBe(0);
    expect(state.firedKeys).toEqual([]);
    expect(state.suppressedKeys).toEqual([]);
  });

  it("returns empty state on corrupt JSON", () => {
    storage[STORAGE_KEY] = "not-json{{{";
    const state = loadExecutionState(new Date(2026, 1, 24));
    expect(state.triggerCountToday).toBe(0);
  });

  it("returns empty state when stored value is non-object", () => {
    storage[STORAGE_KEY] = JSON.stringify("just a string");
    const state = loadExecutionState(new Date(2026, 1, 24));
    expect(state.triggerCountToday).toBe(0);
  });

  it("restores valid persisted state", () => {
    const saved: ExecutionState = {
      dayKey: "2026-02-24",
      triggerCountToday: 3,
      firedKeys: ["trigger_fired::aaa::2026-02-24T00:00:00.000Z"],
      suppressedKeys: ["trigger_suppressed::bbb::2026-02-24T00:00:00.000Z::quiet_hours"],
    };
    storage[STORAGE_KEY] = JSON.stringify(saved);
    const state = loadExecutionState(new Date(2026, 1, 24));
    expect(state.dayKey).toBe("2026-02-24");
    expect(state.triggerCountToday).toBe(3);
    expect(state.firedKeys).toHaveLength(1);
    expect(state.suppressedKeys).toHaveLength(1);
  });

  it("clamps negative triggerCountToday to 0", () => {
    storage[STORAGE_KEY] = JSON.stringify({ dayKey: "2026-02-24", triggerCountToday: -5, firedKeys: [], suppressedKeys: [] });
    const state = loadExecutionState(new Date(2026, 1, 24));
    expect(state.triggerCountToday).toBe(0);
  });

  it("filters non-string values from firedKeys", () => {
    storage[STORAGE_KEY] = JSON.stringify({
      dayKey: "2026-02-24",
      triggerCountToday: 0,
      firedKeys: ["valid", 123, null, "also_valid"],
      suppressedKeys: [],
    });
    const state = loadExecutionState(new Date(2026, 1, 24));
    expect(state.firedKeys).toEqual(["valid", "also_valid"]);
  });
});

describe("saveExecutionState", () => {
  it("persists state to localStorage", () => {
    const state: ExecutionState = {
      dayKey: "2026-02-24",
      triggerCountToday: 2,
      firedKeys: ["a"],
      suppressedKeys: ["b"],
    };
    saveExecutionState(state);
    expect(storage[STORAGE_KEY]).toBeDefined();
    const parsed = JSON.parse(storage[STORAGE_KEY]);
    expect(parsed.triggerCountToday).toBe(2);
  });

  it("caps arrays to max 500 entries (keeps newest)", () => {
    const bigFired = Array.from({ length: 600 }, (_, i) => `f_${i}`);
    const bigSuppressed = Array.from({ length: 600 }, (_, i) => `s_${i}`);
    const state: ExecutionState = {
      dayKey: "2026-02-24",
      triggerCountToday: 0,
      firedKeys: bigFired,
      suppressedKeys: bigSuppressed,
    };
    saveExecutionState(state);
    const parsed = JSON.parse(storage[STORAGE_KEY]);
    expect(parsed.firedKeys).toHaveLength(500);
    expect(parsed.suppressedKeys).toHaveLength(500);
    // Keeps last 500 (newest)
    expect(parsed.firedKeys[0]).toBe("f_100");
    expect(parsed.firedKeys[499]).toBe("f_599");
  });
});

// ---------------------------------------------------------------------------
// resetIfNewLocalDay
// ---------------------------------------------------------------------------

describe("resetIfNewLocalDay", () => {
  it("resets state when day changes", () => {
    const state: ExecutionState = {
      dayKey: "2026-02-23",
      triggerCountToday: 5,
      firedKeys: ["a", "b"],
      suppressedKeys: ["c"],
    };
    const result = resetIfNewLocalDay(new Date(2026, 1, 24), state);
    expect(result.dayKey).toBe("2026-02-24");
    expect(result.triggerCountToday).toBe(0);
    expect(result.firedKeys).toEqual([]);
    expect(result.suppressedKeys).toEqual([]);
  });

  it("does NOT reset when same day", () => {
    const state: ExecutionState = {
      dayKey: "2026-02-24",
      triggerCountToday: 3,
      firedKeys: ["a"],
      suppressedKeys: ["b"],
    };
    const result = resetIfNewLocalDay(new Date(2026, 1, 24, 15, 30), state);
    expect(result.triggerCountToday).toBe(3);
    expect(result.firedKeys).toEqual(["a"]);
  });
});

// ---------------------------------------------------------------------------
// Idempotency key builders
// ---------------------------------------------------------------------------

describe("idempotency key builders", () => {
  const cid = "550e8400-e29b-41d4-a716-446655440000";
  const win = "2026-02-24T00:00:00.000Z";

  it("buildFiredIdempotencyKey format", () => {
    const key = buildFiredIdempotencyKey(cid, win);
    expect(key).toBe(`trigger_fired::${cid}::${win}`);
  });

  it("buildSuppressedIdempotencyKey format", () => {
    const key = buildSuppressedIdempotencyKey(cid, win, "quiet_hours");
    expect(key).toBe(`trigger_suppressed::${cid}::${win}::quiet_hours`);
  });

  it("different reasons produce different keys", () => {
    const k1 = buildSuppressedIdempotencyKey(cid, win, "quiet_hours");
    const k2 = buildSuppressedIdempotencyKey(cid, win, "max_triggers_per_day");
    expect(k1).not.toBe(k2);
  });
});
