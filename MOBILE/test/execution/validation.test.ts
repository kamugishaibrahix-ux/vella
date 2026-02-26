import { describe, it, expect } from "vitest";
import {
  CreateCommitmentSchema,
  ChangeStatusSchema,
  LogOutcomeSchema,
} from "@/lib/execution/validation";

describe("CreateCommitmentSchema", () => {
  const valid = {
    commitment_code: "routine_recurring",
    subject_code: "fitness",
    target_type: "count",
    target_value: 3,
    cadence_type: "recurring",
    start_at: "2026-02-24T00:00:00Z",
  };

  it("accepts a valid recurring commitment", () => {
    const result = CreateCommitmentSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts a valid deadline commitment", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      cadence_type: "deadline",
      target_type: "completion",
      deadline_at: "2026-03-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts nullable end_at and deadline_at", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      end_at: null,
      deadline_at: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid subject_code", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      subject_code: "invalid_domain",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid cadence_type", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      cadence_type: "milestone",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid target_type", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      target_type: "freetext",
    });
    expect(result.success).toBe(false);
  });

  it("rejects target_value > 10000", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      target_value: 99999,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative target_value", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      target_value: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      description: "free text attack",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid ISO timestamp", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      start_at: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects commitment_code with spaces (non-code characters)", () => {
    const result = CreateCommitmentSchema.safeParse({
      ...valid,
      commitment_code: "has spaces",
    });
    expect(result.success).toBe(false);
  });
});

describe("ChangeStatusSchema", () => {
  it("accepts valid status change", () => {
    const result = ChangeStatusSchema.safeParse({
      commitment_id: "550e8400-e29b-41d4-a716-446655440000",
      new_status: "paused",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid statuses", () => {
    for (const status of ["paused", "active", "completed", "abandoned"]) {
      const result = ChangeStatusSchema.safeParse({
        commitment_id: "550e8400-e29b-41d4-a716-446655440000",
        new_status: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    const result = ChangeStatusSchema.safeParse({
      commitment_id: "550e8400-e29b-41d4-a716-446655440000",
      new_status: "deleted",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID commitment_id", () => {
    const result = ChangeStatusSchema.safeParse({
      commitment_id: "not-a-uuid",
      new_status: "paused",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = ChangeStatusSchema.safeParse({
      commitment_id: "550e8400-e29b-41d4-a716-446655440000",
      new_status: "paused",
      reason: "some text",
    });
    expect(result.success).toBe(false);
  });
});

describe("LogOutcomeSchema", () => {
  const valid = {
    commitment_id: "550e8400-e29b-41d4-a716-446655440000",
    outcome_code: "completed",
  };

  it("accepts minimal valid outcome", () => {
    const result = LogOutcomeSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts all outcome codes", () => {
    for (const code of ["completed", "skipped", "missed"]) {
      const result = LogOutcomeSchema.safeParse({ ...valid, outcome_code: code });
      expect(result.success).toBe(true);
    }
  });

  it("accepts optional timestamp fields", () => {
    const result = LogOutcomeSchema.safeParse({
      ...valid,
      occurred_at_iso: "2026-02-24T10:00:00Z",
      window_start_iso: "2026-02-24T06:00:00Z",
      window_end_iso: "2026-02-24T08:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid outcome_code", () => {
    const result = LogOutcomeSchema.safeParse({
      ...valid,
      outcome_code: "abandoned",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    const result = LogOutcomeSchema.safeParse({
      ...valid,
      note: "free text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID commitment_id", () => {
    const result = LogOutcomeSchema.safeParse({
      ...valid,
      commitment_id: "abc",
    });
    expect(result.success).toBe(false);
  });
});
