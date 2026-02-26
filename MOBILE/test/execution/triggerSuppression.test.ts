import { describe, it, expect } from "vitest";
import { TriggerSuppressedSchema } from "@/lib/execution/triggerValidation";
import { shouldFireTrigger, buildIdempotencyKey } from "@/lib/execution/triggerEngine";
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
// TriggerSuppressedSchema validation
// ---------------------------------------------------------------------------

describe("TriggerSuppressedSchema", () => {
  const valid = {
    commitment_id: "550e8400-e29b-41d4-a716-446655440000",
    domain_code: "fitness",
    trigger_type: "window_open",
    window_start_iso: "2026-02-24T00:00:00Z",
    reason_code: "quiet_hours",
    idempotency_key: "trigger_suppressed::550e8400-e29b-41d4-a716-446655440000::2026-02-24T00:00:00Z::quiet_hours",
  };

  it("accepts a valid suppressed payload", () => {
    const result = TriggerSuppressedSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts all reason codes", () => {
    for (const code of ["quiet_hours", "max_triggers_per_day", "cooldown", "no_active_window", "outside_window", "already_fired"]) {
      const result = TriggerSuppressedSchema.safeParse({ ...valid, reason_code: code });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid reason_code", () => {
    const result = TriggerSuppressedSchema.safeParse({ ...valid, reason_code: "unknown" });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID commitment_id", () => {
    const result = TriggerSuppressedSchema.safeParse({ ...valid, commitment_id: "not-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = TriggerSuppressedSchema.safeParse({ ...valid, extra_field: "nope" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { reason_code, ...rest } = valid;
    const result = TriggerSuppressedSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("does not include subject_code field", () => {
    const result = TriggerSuppressedSchema.safeParse({ ...valid, subject_code: "smoking" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suppression reason: quiet_hours
// ---------------------------------------------------------------------------

describe("trigger suppression — quiet_hours", () => {
  it("returns reason_code quiet_hours when inside quiet window", () => {
    const c = makeCommitment();
    const guardrails: GuardrailConfig = {
      ...DEFAULT_GUARDRAILS,
      quiet_hours_start: 10,
      quiet_hours_end: 14,
    };
    const now = new Date("2026-02-24T12:00:00Z"); // hour 12, inside 10-14
    const result = shouldFireTrigger(c, now, 0, new Map(), guardrails, 0);
    expect(result.fire).toBe(false);
    if (!result.fire) {
      expect(result.reason).toBe("quiet_hours");
    }
  });
});

// ---------------------------------------------------------------------------
// Suppression reason: daily_cap (max_triggers_per_day)
// ---------------------------------------------------------------------------

describe("trigger suppression — daily_cap", () => {
  it("returns reason_code max_triggers_per_day when cap reached", () => {
    const c = makeCommitment();
    const now = new Date("2026-02-24T12:00:00Z");
    const result = shouldFireTrigger(c, now, 0, new Map(), DEFAULT_GUARDRAILS, 5);
    expect(result.fire).toBe(false);
    if (!result.fire) {
      expect(result.reason).toBe("max_triggers_per_day");
    }
  });

  it("fires when under cap", () => {
    const c = makeCommitment();
    const now = new Date("2026-02-24T12:00:00Z");
    const result = shouldFireTrigger(c, now, 0, new Map(), DEFAULT_GUARDRAILS, 4);
    expect(result.fire).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Inbox idempotency: same window → exactly one item
// ---------------------------------------------------------------------------

describe("inbox idempotency", () => {
  it("fired path produces exactly one idempotency key per window", () => {
    const c = makeCommitment();
    const now = new Date("2026-02-24T12:00:00Z");
    const states = new Map<string, TriggerState>();

    // First evaluation — should fire
    const r1 = shouldFireTrigger(c, now, 0, states, DEFAULT_GUARDRAILS, 0);
    expect(r1.fire).toBe(true);
    if (r1.fire) {
      // Record the fire (simulating scheduler behaviour)
      states.set(r1.idempotencyKey, {
        last_fired_key: r1.idempotencyKey,
        last_fired_at: now.toISOString(),
      });
    }

    // Second evaluation — same window, should NOT fire (already_fired)
    const r2 = shouldFireTrigger(c, now, 0, states, DEFAULT_GUARDRAILS, 1);
    expect(r2.fire).toBe(false);
    if (!r2.fire) {
      expect(r2.reason).toBe("already_fired");
    }

    // The inbox write is keyed by commitment_id + window_start_iso.
    // Since only one fire event happens per window, only one inbox item is created.
    // Verify the idempotency key is deterministic and stable.
    if (r1.fire) {
      const key1 = r1.idempotencyKey;
      const key2 = buildIdempotencyKey(c.id, r1.window.window_start);
      expect(key1).toBe(key2);
    }
  });

  it("different windows produce different idempotency keys", () => {
    const c = makeCommitment();
    const day1 = new Date("2026-02-24T12:00:00Z");
    const day2 = new Date("2026-02-25T12:00:00Z");

    const r1 = shouldFireTrigger(c, day1, 0, new Map(), DEFAULT_GUARDRAILS, 0);
    const r2 = shouldFireTrigger(c, day2, 0, new Map(), DEFAULT_GUARDRAILS, 0);

    expect(r1.fire).toBe(true);
    expect(r2.fire).toBe(true);
    if (r1.fire && r2.fire) {
      expect(r1.idempotencyKey).not.toBe(r2.idempotencyKey);
    }
  });
});
