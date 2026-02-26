import { describe, it, expect } from "vitest";
import { TriggerLogSchema } from "@/lib/execution/triggerValidation";

describe("TriggerLogSchema", () => {
  const valid = {
    commitment_id: "550e8400-e29b-41d4-a716-446655440000",
    domain_code: "fitness",
    trigger_type: "window_open",
    window_start_iso: "2026-02-24T00:00:00Z",
    window_end_iso: "2026-02-24T23:59:59Z",
    idempotency_key: "trigger_fired::550e8400-e29b-41d4-a716-446655440000::2026-02-24T00:00:00Z",
  };

  it("accepts a valid trigger log payload", () => {
    const result = TriggerLogSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts all domain codes", () => {
    for (const code of ["sleep", "focus", "routine", "fitness", "abstinence", "social", "other"]) {
      const result = TriggerLogSchema.safeParse({ ...valid, domain_code: code });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid domain_code", () => {
    const result = TriggerLogSchema.safeParse({ ...valid, domain_code: "invalid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid trigger_type", () => {
    const result = TriggerLogSchema.safeParse({ ...valid, trigger_type: "push_notification" });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID commitment_id", () => {
    const result = TriggerLogSchema.safeParse({ ...valid, commitment_id: "not-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ISO timestamps", () => {
    const result = TriggerLogSchema.safeParse({ ...valid, window_start_iso: "not-a-date" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = TriggerLogSchema.safeParse({ ...valid, message: "hello" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { commitment_id, ...rest } = valid;
    const result = TriggerLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
