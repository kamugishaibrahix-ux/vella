/**
 * governance_state is a SAFE_TABLE: metadata-only (state_json contains codes/numbers).
 * Ensures safeUpsert/fromSafe work and free-text in state_json is rejected.
 */
import { describe, it, expect } from "vitest";
import { safeUpsert, safeInsert, SafeDataError } from "@/lib/safe/safeSupabaseWrite";

const mockClient = {
  from: (_table: string) => ({
    upsert: () => Promise.resolve({ data: null, error: null }),
    insert: () => Promise.resolve({ data: null, error: null }),
  }),
};

const validGovernanceRow: Record<string, unknown> = {
  user_id: "00000000-0000-0000-0000-000000000001",
  state_json: {
    recovery_state: "ok",
    discipline_state: "on_track",
    focus_state: "na",
    governance_risk_score: 0,
    escalation_level: 0,
    last_computed_at_iso: "2025-01-01T00:00:00.000Z",
  },
  last_computed_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

const validBehaviourEventRow: Record<string, unknown> = {
  user_id: "00000000-0000-0000-0000-000000000001",
  event_type: "commitment_completed",
  occurred_at: "2025-01-01T00:00:00.000Z",
  metadata: {},
};

describe("governance_state as SAFE_TABLE", () => {
  it("safeUpsert governance_state with valid metadata-only state_json succeeds", async () => {
    const result = await safeUpsert(
      "governance_state",
      validGovernanceRow,
      { onConflict: "user_id" },
      mockClient as any
    );
    expect(result).toBeDefined();
    expect((result as { error: unknown }).error).toBeNull();
  });

  it("safeUpsert governance_state with banned key inside state_json throws BANNED_FIELD_DETECTED", () => {
    const rowWithBannedKey: Record<string, unknown> = {
      ...validGovernanceRow,
      state_json: {
        ...(validGovernanceRow.state_json as Record<string, unknown>),
        message: "free text not allowed",
      },
    };
    expect(() => {
      safeUpsert(
        "governance_state",
        rowWithBannedKey,
        { onConflict: "user_id" },
        mockClient as any
      );
    }).toThrow(SafeDataError);
    try {
      safeUpsert(
        "governance_state",
        rowWithBannedKey,
        { onConflict: "user_id" },
        mockClient as any
      );
    } catch (e) {
      expect(e).toBeInstanceOf(SafeDataError);
      expect((e as SafeDataError).code).toBe("BANNED_FIELD_DETECTED");
      expect((e as SafeDataError).key).toBe("message");
      expect((e as SafeDataError).table).toBe("governance_state");
    }
  });

  it("safeInsert behaviour_events with valid metadata-only payload succeeds", async () => {
    const result = await safeInsert(
      "behaviour_events",
      validBehaviourEventRow,
      undefined,
      mockClient as any
    );
    expect(result).toBeDefined();
    expect((result as { error: unknown }).error).toBeNull();
  });
});
