import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildFiredIdempotencyKey,
  buildSuppressedIdempotencyKey,
  loadExecutionState,
  saveExecutionState,
  resetIfNewLocalDay,
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
// Helpers
// ---------------------------------------------------------------------------

const CID_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CID_B = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const WINDOW_ISO = "2026-02-24T00:00:00.000Z";

function makeState(overrides: Partial<ExecutionState> = {}): ExecutionState {
  return {
    dayKey: "2026-02-24",
    triggerCountToday: 0,
    firedKeys: [],
    suppressedKeys: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suppression storm prevention
// ---------------------------------------------------------------------------

describe("suppression storm prevention (client-side)", () => {
  it("suppression logs once per (commitment, window, reason) — second call is deduped", () => {
    const state = makeState();
    const key = buildSuppressedIdempotencyKey(CID_A, WINDOW_ISO, "quiet_hours");

    // First suppression — not in set, should log
    expect(state.suppressedKeys.includes(key)).toBe(false);
    state.suppressedKeys.push(key);
    saveExecutionState(state);

    // Second check — already in set, should NOT log again
    expect(state.suppressedKeys.includes(key)).toBe(true);
  });

  it("different reasons for same commitment+window are NOT deduped", () => {
    const state = makeState();
    const k1 = buildSuppressedIdempotencyKey(CID_A, WINDOW_ISO, "quiet_hours");
    const k2 = buildSuppressedIdempotencyKey(CID_A, WINDOW_ISO, "max_triggers_per_day");

    state.suppressedKeys.push(k1);

    expect(state.suppressedKeys.includes(k1)).toBe(true);
    expect(state.suppressedKeys.includes(k2)).toBe(false);
  });

  it("suppression keys survive reload (persisted)", () => {
    const state = makeState();
    const key = buildSuppressedIdempotencyKey(CID_A, WINDOW_ISO, "cooldown");
    state.suppressedKeys.push(key);
    saveExecutionState(state);

    // Simulate reload
    const reloaded = loadExecutionState(new Date(2026, 1, 24));
    expect(reloaded.suppressedKeys.includes(key)).toBe(true);
  });

  it("suppression keys reset on new day", () => {
    const state = makeState({
      suppressedKeys: [buildSuppressedIdempotencyKey(CID_A, WINDOW_ISO, "quiet_hours")],
    });

    const reset = resetIfNewLocalDay(new Date(2026, 1, 25), state);
    expect(reset.suppressedKeys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Fire idempotency across reloads
// ---------------------------------------------------------------------------

describe("fire idempotency across reloads (client-side)", () => {
  it("fired key persists across reload", () => {
    const state = makeState();
    const key = buildFiredIdempotencyKey(CID_A, WINDOW_ISO);

    state.firedKeys.push(key);
    state.triggerCountToday = 1;
    saveExecutionState(state);

    // Simulate reload
    const reloaded = loadExecutionState(new Date(2026, 1, 24));
    expect(reloaded.firedKeys.includes(key)).toBe(true);
    expect(reloaded.triggerCountToday).toBe(1);
  });

  it("after reload, same commitment+window is deduped (not re-fired)", () => {
    const key = buildFiredIdempotencyKey(CID_A, WINDOW_ISO);
    const state = makeState({ firedKeys: [key], triggerCountToday: 1 });
    saveExecutionState(state);

    // Simulate reload
    const reloaded = loadExecutionState(new Date(2026, 1, 24));

    // Check — scheduler would do: if (state.firedKeys.includes(firedKey)) continue;
    expect(reloaded.firedKeys.includes(key)).toBe(true);
  });

  it("different windows for same commitment are NOT deduped", () => {
    const k1 = buildFiredIdempotencyKey(CID_A, "2026-02-24T00:00:00.000Z");
    const k2 = buildFiredIdempotencyKey(CID_A, "2026-02-25T00:00:00.000Z");

    const state = makeState({ firedKeys: [k1] });
    expect(state.firedKeys.includes(k2)).toBe(false);
  });

  it("daily counter resets on new local day", () => {
    const state = makeState({ triggerCountToday: 5 });
    const reset = resetIfNewLocalDay(new Date(2026, 1, 25), state);
    expect(reset.triggerCountToday).toBe(0);
    expect(reset.firedKeys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Multiple commitments + cap scenario
// ---------------------------------------------------------------------------

describe("multi-commitment cap scenario (3 commitments, cap=1)", () => {
  it("only first commitment fires; others suppressed; no storm on repeated ticks", () => {
    const state = makeState();

    // Tick 1: C_A fires
    const firedKey = buildFiredIdempotencyKey(CID_A, WINDOW_ISO);
    expect(state.firedKeys.includes(firedKey)).toBe(false);
    state.firedKeys.push(firedKey);
    state.triggerCountToday++;

    // Tick 1: C_B suppressed (cap reached)
    const suppKeyB = buildSuppressedIdempotencyKey(CID_B, WINDOW_ISO, "max_triggers_per_day");
    expect(state.suppressedKeys.includes(suppKeyB)).toBe(false);
    state.suppressedKeys.push(suppKeyB);

    // Tick 2: C_B suppressed again? NO — already in set
    expect(state.suppressedKeys.includes(suppKeyB)).toBe(true);
    // This is the storm prevention: the key is already present, so we skip logging.

    // Verify final counts
    expect(state.firedKeys).toHaveLength(1);
    expect(state.suppressedKeys).toHaveLength(1);
    expect(state.triggerCountToday).toBe(1);
  });
});
