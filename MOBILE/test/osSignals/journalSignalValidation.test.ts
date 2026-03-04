/**
 * Tests for journal signal validation in server schemas.
 * Covers: signals accepted in signals_only mode, rejected in private mode,
 * stored signals contain only allowed enums and bounded numbers.
 */

import { describe, it, expect } from "vitest";
import {
  journalCreateSchema,
  journalUpdateSchema,
} from "@/lib/security/validationSchemas";

const VALID_HASH = "a".repeat(64);

function baseCreateMeta(mode: "private" | "signals_only") {
  return {
    id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    created_at: "2026-02-27T10:00:00.000Z",
    updated_at: "2026-02-27T10:00:00.000Z",
    word_count: 42,
    local_hash: VALID_HASH,
    processing_mode: mode,
  };
}

function baseUpdateMeta(mode: "private" | "signals_only") {
  return {
    id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    updated_at: "2026-02-27T10:00:00.000Z",
    word_count: 42,
    local_hash: VALID_HASH,
    processing_mode: mode,
  };
}

const VALID_SIGNAL = {
  domain: "emotional-intelligence" as const,
  code: "EI_ANXIETY_ELEVATED" as const,
  severity: "moderate" as const,
  confidence: 60,
  source: "journal" as const,
};

// ---------------------------------------------------------------------------
// Signals accepted in signals_only mode
// ---------------------------------------------------------------------------

describe("signals accepted in signals_only mode", () => {
  it("accepts payload with valid signals in signals_only mode (create)", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [VALID_SIGNAL],
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with valid signals in signals_only mode (update)", () => {
    const result = journalUpdateSchema.safeParse({
      ...baseUpdateMeta("signals_only"),
      signals: [VALID_SIGNAL],
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload without signals in signals_only mode", () => {
    const result = journalCreateSchema.safeParse(baseCreateMeta("signals_only"));
    expect(result.success).toBe(true);
  });

  it("accepts empty signals array in signals_only mode", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts up to 8 signals", () => {
    const signals = Array.from({ length: 8 }, () => ({ ...VALID_SIGNAL }));
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Signals rejected in private mode
// ---------------------------------------------------------------------------

describe("signals rejected in private mode", () => {
  it("rejects non-empty signals array in private mode (create)", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("private"),
      signals: [VALID_SIGNAL],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("SIGNALS_NOT_ALLOWED_IN_PRIVATE_MODE");
    }
  });

  it("rejects non-empty signals array in private mode (update)", () => {
    const result = journalUpdateSchema.safeParse({
      ...baseUpdateMeta("private"),
      signals: [VALID_SIGNAL],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("SIGNALS_NOT_ALLOWED_IN_PRIVATE_MODE");
    }
  });

  it("accepts empty signals array in private mode", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("private"),
      signals: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts no signals field in private mode", () => {
    const result = journalCreateSchema.safeParse(baseCreateMeta("private"));
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stored signals contain only allowed enums and bounded numbers
// ---------------------------------------------------------------------------

describe("signal schema validation", () => {
  it("rejects signal with invalid domain", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [{ ...VALID_SIGNAL, domain: "bogus-domain" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects signal with invalid code", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [{ ...VALID_SIGNAL, code: "INVALID_CODE" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects signal with invalid severity", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [{ ...VALID_SIGNAL, severity: "extreme" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects signal with confidence > 100", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [{ ...VALID_SIGNAL, confidence: 150 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects signal with confidence < 0", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [{ ...VALID_SIGNAL, confidence: -5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects signal with non-integer confidence", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [{ ...VALID_SIGNAL, confidence: 55.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects signal with wrong source", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [{ ...VALID_SIGNAL, source: "ai" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 signals", () => {
    const signals = Array.from({ length: 9 }, () => ({ ...VALID_SIGNAL }));
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals,
    });
    expect(result.success).toBe(false);
  });

  it("rejects signal with extra unknown fields (strict mode)", () => {
    const result = journalCreateSchema.safeParse({
      ...baseCreateMeta("signals_only"),
      signals: [{ ...VALID_SIGNAL, extra_field: "not allowed" }],
    });
    expect(result.success).toBe(false);
  });
});
