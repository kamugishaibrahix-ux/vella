/**
 * Test validation schemas and error responses.
 */
import { describe, it, expect } from "vitest";
import {
  clarityRequestSchema,
  journalCreateSchema,
  journalUpdateSchema,
  insightsPatternRequestSchema,
  insightsGenerateRequestSchema,
  stripeCheckoutSessionSchema,
  stripeTokenPackSchema,
  vellaTextRequestSchema,
} from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";

describe("validationSchemas", () => {
  describe("clarityRequestSchema", () => {
    it("accepts valid input", () => {
      const result = clarityRequestSchema.safeParse({
        freeText: "This is a valid message",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty text", () => {
      const result = clarityRequestSchema.safeParse({
        freeText: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects text over 1000 characters", () => {
      const result = clarityRequestSchema.safeParse({
        freeText: "a".repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields", () => {
      const result = clarityRequestSchema.safeParse({
        freeText: "Valid text",
        unknownField: "should be rejected",
      });
      expect(result.success).toBe(false);
    });

    it("trims whitespace", () => {
      const result = clarityRequestSchema.safeParse({
        freeText: "  text with spaces  ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.freeText).toBe("text with spaces");
      }
    });
  });

  describe("journalCreateSchema", () => {
    it("accepts valid journal entry", () => {
      const result = journalCreateSchema.safeParse({
        text: "My journal entry",
        title: "Optional title",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty text", () => {
      const result = journalCreateSchema.safeParse({
        text: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects text over 10000 characters", () => {
      const result = journalCreateSchema.safeParse({
        text: "a".repeat(10001),
      });
      expect(result.success).toBe(false);
    });

    it("rejects title over 200 characters", () => {
      const result = journalCreateSchema.safeParse({
        text: "Valid text",
        title: "a".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields", () => {
      const result = journalCreateSchema.safeParse({
        text: "Valid text",
        unknownField: "should be rejected",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("journalUpdateSchema", () => {
    it("accepts valid update", () => {
      const result = journalUpdateSchema.safeParse({
        id: "entry-123",
        text: "Updated text",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = journalUpdateSchema.safeParse({
        text: "Text without id",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields", () => {
      const result = journalUpdateSchema.safeParse({
        id: "entry-123",
        text: "Valid text",
        unknownField: "should be rejected",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("insightsPatternRequestSchema", () => {
    it("accepts valid input", () => {
      const result = insightsPatternRequestSchema.safeParse({
        checkins: [
          { mood: 7, stress: 3, energy: 8, focus: 6, note: "Feeling good" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects mood values outside 0-10", () => {
      const result = insightsPatternRequestSchema.safeParse({
        checkins: [{ mood: 11 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects over 100 check-ins", () => {
      const result = insightsPatternRequestSchema.safeParse({
        checkins: Array(101).fill({ mood: 5 }),
      });
      expect(result.success).toBe(false);
    });

    it("rejects note over 500 characters", () => {
      const result = insightsPatternRequestSchema.safeParse({
        checkins: [{ note: "a".repeat(501) }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields", () => {
      const result = insightsPatternRequestSchema.safeParse({
        checkins: [],
        unknownField: "should be rejected",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("insightsGenerateRequestSchema", () => {
    it("accepts valid input", () => {
      const result = insightsGenerateRequestSchema.safeParse({
        checkins: [{ date: "2024-01-01", mood: 7 }],
        patterns: {
          commonPrimaryEmotions: ["joy", "contentment"],
          commonTriggers: ["work stress"],
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects patterns with too many items", () => {
      const result = insightsGenerateRequestSchema.safeParse({
        checkins: [],
        patterns: {
          commonPrimaryEmotions: Array(21).fill("emotion"),
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects patterns with oversized strings", () => {
      const result = insightsGenerateRequestSchema.safeParse({
        checkins: [],
        patterns: {
          commonPrimaryEmotions: ["a".repeat(101)],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects behaviourVector outside 0-1 range", () => {
      const result = insightsGenerateRequestSchema.safeParse({
        checkins: [],
        behaviourVector: { autonomy: 1.5 },
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields", () => {
      const result = insightsGenerateRequestSchema.safeParse({
        checkins: [],
        unknownField: "should be rejected",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("stripeCheckoutSessionSchema", () => {
    it("accepts valid plan", () => {
      const result = stripeCheckoutSessionSchema.safeParse({
        plan: "pro",
      });
      expect(result.success).toBe(true);
    });

    it("rejects free plan", () => {
      const result = stripeCheckoutSessionSchema.safeParse({
        plan: "free",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid plan", () => {
      const result = stripeCheckoutSessionSchema.safeParse({
        plan: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("validates email format", () => {
      const result = stripeCheckoutSessionSchema.safeParse({
        plan: "pro",
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields", () => {
      const result = stripeCheckoutSessionSchema.safeParse({
        plan: "pro",
        unknownField: "should be rejected",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("stripeTokenPackSchema", () => {
    it("accepts valid packId", () => {
      const result = stripeTokenPackSchema.safeParse({
        packId: "pack_small",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid packId", () => {
      const result = stripeTokenPackSchema.safeParse({
        packId: "pack_invalid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown fields", () => {
      const result = stripeTokenPackSchema.safeParse({
        packId: "pack_small",
        unknownField: "should be rejected",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("validationErrorResponse", () => {
  it("returns 400 status", async () => {
    const response = validationErrorResponse();
    expect(response.status).toBe(400);
  });

  it("returns VALIDATION_ERROR code", async () => {
    const response = validationErrorResponse();
    const json = await response.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(json.message).toBeDefined();
  });

  it("accepts custom message", async () => {
    const response = validationErrorResponse("Custom error message");
    const json = await response.json();
    expect(json.message).toBe("Custom error message");
  });
});

describe("formatZodError", () => {
  it("formats Zod error into readable message", () => {
    const schema = clarityRequestSchema;
    const result = schema.safeParse({ freeText: "" });
    if (!result.success) {
      const message = formatZodError(result.error);
      expect(message).toContain("freeText");
    }
  });

  it("handles non-Zod errors", () => {
    const message = formatZodError(new Error("Generic error"));
    expect(message).toBe("Invalid request data.");
  });

  describe("vellaTextRequestSchema", () => {
    it("accepts message only", () => {
      const result = vellaTextRequestSchema.safeParse({ message: "Hello" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.mode).toBeUndefined();
    });

    it("accepts optional mode (vent | listen | challenge | coach | crisis)", () => {
      expect(vellaTextRequestSchema.safeParse({ message: "Hi", mode: "listen" }).success).toBe(true);
      expect(vellaTextRequestSchema.safeParse({ message: "Hi", mode: "crisis" }).success).toBe(true);
      expect(vellaTextRequestSchema.safeParse({ message: "Hi", mode: "vent" }).success).toBe(true);
    });

    it("rejects invalid mode", () => {
      expect(vellaTextRequestSchema.safeParse({ message: "Hi", mode: "invalid" }).success).toBe(false);
    });

    it("accepts optional activeValues (value codes from client)", () => {
      const r = vellaTextRequestSchema.safeParse({
        message: "Hi",
        activeValues: ["discipline", "health"],
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.activeValues).toEqual(["discipline", "health"]);
    });
  });
});
