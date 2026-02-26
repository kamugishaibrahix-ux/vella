import { describe, it, expect } from "vitest";
import {
  computeCurrentWindow,
  shouldFireTrigger,
  buildIdempotencyKey,
} from "@/lib/execution/triggerEngine";
import type { CommitmentMetadata, TriggerState, GuardrailConfig } from "@/lib/execution/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCommitment(overrides: Partial<CommitmentMetadata> = {}): CommitmentMetadata {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    user_id: "11111111-2222-3333-4444-555555555555",
    commitment_code: "routine_recurring",
    subject_code: "fitness",
    target_type: "count",
    target_value: 1,
    cadence_type: "recurring",
    status: "active",
    start_at: "2026-02-01T00:00:00Z",
    end_at: null,
    deadline_at: null,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

const DEFAULT_GUARDRAILS: GuardrailConfig = {
  max_triggers_per_day: 5,
  cooldown_minutes: 30,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

// ---------------------------------------------------------------------------
// computeCurrentWindow
// ---------------------------------------------------------------------------

describe("computeCurrentWindow", () => {
  const NOW = new Date("2026-02-24T12:00:00Z");

  it("returns daily window for active recurring commitment", () => {
    const c = makeCommitment();
    const w = computeCurrentWindow(c, NOW, 0);
    expect(w).not.toBeNull();
    expect(w!.commitment_id).toBe(c.id);
    expect(w!.window_start.toISOString()).toBe("2026-02-24T00:00:00.000Z");
    expect(w!.window_end.toISOString()).toBe("2026-02-24T23:59:59.999Z");
  });

  it("adjusts window for timezone offset", () => {
    const c = makeCommitment();
    // UTC-8 (480 minutes) — local time is 04:00
    const w = computeCurrentWindow(c, NOW, 480);
    expect(w).not.toBeNull();
    // Local day starts at 08:00 UTC, ends at 07:59:59.999 UTC next day
    expect(w!.window_start.toISOString()).toBe("2026-02-24T08:00:00.000Z");
    expect(w!.window_end.toISOString()).toBe("2026-02-25T07:59:59.999Z");
  });

  it("returns null for paused commitment", () => {
    const c = makeCommitment({ status: "paused" });
    expect(computeCurrentWindow(c, NOW, 0)).toBeNull();
  });

  it("returns null for completed commitment", () => {
    const c = makeCommitment({ status: "completed" });
    expect(computeCurrentWindow(c, NOW, 0)).toBeNull();
  });

  it("returns null for abandoned commitment", () => {
    const c = makeCommitment({ status: "abandoned" });
    expect(computeCurrentWindow(c, NOW, 0)).toBeNull();
  });

  it("returns null if start_at is in the future", () => {
    const c = makeCommitment({ start_at: "2026-03-01T00:00:00Z" });
    expect(computeCurrentWindow(c, NOW, 0)).toBeNull();
  });

  it("returns null if end_at has passed", () => {
    const c = makeCommitment({ end_at: "2026-02-20T00:00:00Z" });
    expect(computeCurrentWindow(c, NOW, 0)).toBeNull();
  });

  it("returns null for deadline cadence past deadline", () => {
    const c = makeCommitment({
      cadence_type: "deadline",
      deadline_at: "2026-02-20T00:00:00Z",
    });
    expect(computeCurrentWindow(c, NOW, 0)).toBeNull();
  });

  it("returns window for deadline cadence before deadline", () => {
    const c = makeCommitment({
      cadence_type: "deadline",
      deadline_at: "2026-03-01T00:00:00Z",
    });
    const w = computeCurrentWindow(c, NOW, 0);
    expect(w).not.toBeNull();
    expect(w!.window_end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("returns null for deadline cadence with no deadline_at", () => {
    const c = makeCommitment({ cadence_type: "deadline", deadline_at: null });
    expect(computeCurrentWindow(c, NOW, 0)).toBeNull();
  });

  it("returns null for invalid start_at", () => {
    const c = makeCommitment({ start_at: "not-a-date" });
    expect(computeCurrentWindow(c, NOW, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildIdempotencyKey
// ---------------------------------------------------------------------------

describe("buildIdempotencyKey", () => {
  it("produces deterministic key from commitment_id + window_start", () => {
    const key = buildIdempotencyKey("abc-123", new Date("2026-02-24T00:00:00.000Z"));
    expect(key).toBe("abc-123::2026-02-24T00:00:00.000Z");
  });

  it("produces different keys for different windows", () => {
    const k1 = buildIdempotencyKey("abc", new Date("2026-02-24T00:00:00.000Z"));
    const k2 = buildIdempotencyKey("abc", new Date("2026-02-25T00:00:00.000Z"));
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// shouldFireTrigger
// ---------------------------------------------------------------------------

describe("shouldFireTrigger", () => {
  const NOW = new Date("2026-02-24T12:00:00Z");
  const TZ = 0; // UTC

  it("fires for active commitment in current window", () => {
    const c = makeCommitment();
    const result = shouldFireTrigger(c, NOW, TZ, new Map(), DEFAULT_GUARDRAILS, 0);
    expect(result.fire).toBe(true);
    if (result.fire) {
      expect(result.idempotencyKey).toContain(c.id);
    }
  });

  it("does NOT fire twice for the same window (idempotency)", () => {
    const c = makeCommitment();
    const states = new Map<string, TriggerState>();
    // First fire
    const r1 = shouldFireTrigger(c, NOW, TZ, states, DEFAULT_GUARDRAILS, 0);
    expect(r1.fire).toBe(true);
    if (r1.fire) {
      states.set(r1.idempotencyKey, {
        last_fired_key: r1.idempotencyKey,
        last_fired_at: NOW.toISOString(),
      });
    }
    // Second fire attempt — same window
    const r2 = shouldFireTrigger(c, NOW, TZ, states, DEFAULT_GUARDRAILS, 1);
    expect(r2.fire).toBe(false);
    if (!r2.fire) expect(r2.reason).toBe("already_fired");
  });

  it("does NOT fire when max_triggers_per_day reached", () => {
    const c = makeCommitment();
    const result = shouldFireTrigger(c, NOW, TZ, new Map(), DEFAULT_GUARDRAILS, 5);
    expect(result.fire).toBe(false);
    if (!result.fire) expect(result.reason).toBe("max_triggers_per_day");
  });

  it("does NOT fire during cooldown period", () => {
    const c = makeCommitment();
    // Use yesterday's window start so idempotency key differs from today's window
    const previousKey = buildIdempotencyKey(c.id, new Date("2026-02-23T00:00:00.000Z"));
    const states = new Map<string, TriggerState>();
    // Fired 10 minutes ago for yesterday's window
    states.set(previousKey, {
      last_fired_key: previousKey,
      last_fired_at: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    });

    // Today's window is different, but cooldown (30min) should block since last fire was 10min ago
    const result = shouldFireTrigger(c, NOW, TZ, states, DEFAULT_GUARDRAILS, 0);
    expect(result.fire).toBe(false);
    if (!result.fire) expect(result.reason).toBe("cooldown");
  });

  it("fires after cooldown expires", () => {
    const c = makeCommitment();
    const oldKey = buildIdempotencyKey(c.id, new Date("2026-02-23T00:00:00.000Z"));
    const states = new Map<string, TriggerState>();
    // Fired 45 minutes ago — cooldown is 30min, so should be clear
    states.set(oldKey, {
      last_fired_key: oldKey,
      last_fired_at: new Date(NOW.getTime() - 45 * 60_000).toISOString(),
    });

    const result = shouldFireTrigger(c, NOW, TZ, states, DEFAULT_GUARDRAILS, 0);
    expect(result.fire).toBe(true);
  });

  it("does NOT fire during quiet hours", () => {
    const c = makeCommitment();
    const guardrails: GuardrailConfig = {
      ...DEFAULT_GUARDRAILS,
      quiet_hours_start: 10, // 10:00
      quiet_hours_end: 14,   // 14:00
    };
    // NOW is 12:00 UTC, TZ=0, so local hour is 12 — inside quiet hours
    const result = shouldFireTrigger(c, NOW, TZ, new Map(), guardrails, 0);
    expect(result.fire).toBe(false);
    if (!result.fire) expect(result.reason).toBe("quiet_hours");
  });

  it("fires outside quiet hours", () => {
    const c = makeCommitment();
    const guardrails: GuardrailConfig = {
      ...DEFAULT_GUARDRAILS,
      quiet_hours_start: 22, // 22:00
      quiet_hours_end: 6,    // 06:00 (wraps midnight)
    };
    // NOW is 12:00 UTC — outside quiet hours
    const result = shouldFireTrigger(c, NOW, TZ, new Map(), guardrails, 0);
    expect(result.fire).toBe(true);
  });

  it("handles quiet hours wrapping midnight", () => {
    const c = makeCommitment();
    const guardrails: GuardrailConfig = {
      ...DEFAULT_GUARDRAILS,
      quiet_hours_start: 22,
      quiet_hours_end: 6,
    };
    // 2:00 UTC, TZ=0 → local hour 2, inside 22-06 quiet window
    const nightNow = new Date("2026-02-24T02:00:00Z");
    const result = shouldFireTrigger(c, nightNow, TZ, new Map(), guardrails, 0);
    expect(result.fire).toBe(false);
    if (!result.fire) expect(result.reason).toBe("quiet_hours");
  });

  it("does NOT fire for inactive commitment", () => {
    const c = makeCommitment({ status: "paused" });
    const result = shouldFireTrigger(c, NOW, TZ, new Map(), DEFAULT_GUARDRAILS, 0);
    expect(result.fire).toBe(false);
    if (!result.fire) expect(result.reason).toBe("no_active_window");
  });

  it("fires for different commitment after one already fired", () => {
    const c1 = makeCommitment({ id: "aaaaaaaa-0001-0001-0001-000000000001" });
    const c2 = makeCommitment({ id: "aaaaaaaa-0002-0002-0002-000000000002" });
    const states = new Map<string, TriggerState>();

    const r1 = shouldFireTrigger(c1, NOW, TZ, states, DEFAULT_GUARDRAILS, 0);
    expect(r1.fire).toBe(true);
    if (r1.fire) {
      states.set(r1.idempotencyKey, {
        last_fired_key: r1.idempotencyKey,
        last_fired_at: NOW.toISOString(),
      });
    }

    // c2 should still fire — different commitment, no cooldown on c2
    const r2 = shouldFireTrigger(c2, NOW, TZ, states, DEFAULT_GUARDRAILS, 1);
    expect(r2.fire).toBe(true);
  });
});
