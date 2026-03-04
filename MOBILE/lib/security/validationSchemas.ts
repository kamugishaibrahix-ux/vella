/**
 * Strict Zod validation schemas for high-impact API routes.
 * All schemas reject unknown fields and enforce length limits.
 */
import { z } from "zod";
import { OSSignalsArraySchema } from "@/lib/osSignals/taxonomy";

// ======================
// Text Generation Routes
// ======================

/**
 * Clarity route: message length capped at 1000 characters.
 */
export const clarityRequestSchema = z
  .object({
    freeText: z.string().min(1, "Text is required").max(1000, "Text cannot exceed 1000 characters").trim(),
    frame: z.record(z.string(), z.unknown()).optional(),
  })
  .strict(); // Reject unknown fields

/**
 * Strategy, compass, emotion-intel, deepdive routes: message length capped at 2000 characters.
 */
export const textGenerationRequestSchema = z
  .object({
    message: z.string().min(1, "Message is required").max(2000, "Message cannot exceed 2000 characters").trim(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** VellaMode for request body (vent | listen | challenge | coach | crisis). */
const vellaModeSchema = z.enum(["vent", "listen", "challenge", "coach", "crisis"]);

/**
 * Optional value codes from client (stored locally). Only structured codes; no free text.
 */
const valueCodeSchema = z.string().min(1).max(50).trim();

/**
 * Vella text route: message required and capped at 4000 chars; optional language, mode, activeValues.
 */
const conversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
});

/** Personal OS enforcement mode hint from client. */
const osModeSchema = z.enum(["strict", "soft", "observe"]);

export const vellaTextRequestSchema = z
  .object({
    message: z.string().min(1, "Message is required").max(4000, "Message cannot exceed 4000 characters").trim(),
    language: z.string().max(10, "Language code too long").optional(),
    session_id: z.string().uuid().optional().nullable(),
    mode: vellaModeSchema.optional().nullable(),
    osMode: osModeSchema.optional().nullable(),
    interactionMode: z.enum(["reflect", "guide", "plan"]).optional().nullable(),
    activeValues: z.array(valueCodeSchema).max(20).optional(),
    conversationHistory: z.array(conversationTurnSchema).max(30).optional(),
    image: z.string().max(3_500_000).optional(),
    hasImage: z.boolean().optional(),
    visionConstraints: z
      .object({
        allowed: z.array(z.string()).optional(),
        blocked: z.array(z.string()).optional(),
        safetyProtocol: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

/**
 * Growth roadmap route: persona optional; when string, 1–2000 chars; when object, serialized size ≤ 2000.
 */
export const growthRoadmapRequestSchema = z
  .object({
    persona: z
      .union([z.string().min(1, "persona required when provided").max(2000, "persona cannot exceed 2000 characters"), z.record(z.string(), z.unknown())])
      .optional()
      .nullable(),
  })
  .strict()
  .refine(
    (data) =>
      data.persona == null ||
      typeof data.persona === "string" ||
      (typeof data.persona === "object" && JSON.stringify(data.persona).length <= 2000),
    { message: "persona cannot exceed 2000 characters" }
  );

// ======================
// Journal Routes (metadata-only — text never leaves device)
// ======================

/**
 * Journal POST: metadata-only. Text/title must NOT be sent.
 * .strict() rejects unknown fields (including text, title, content).
 */
export const journalCreateSchema = z
  .object({
    id: z.string().uuid("id must be a valid UUID"),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().optional(),
    word_count: z.number().int().min(0).max(100000),
    local_hash: z.string().length(64, "local_hash must be 64-char hex (SHA-256)"),
    processing_mode: z.enum(["private", "signals_only"]),
    signals: OSSignalsArraySchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.processing_mode === "private" && data.signals && data.signals.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SIGNALS_NOT_ALLOWED_IN_PRIVATE_MODE",
        path: ["signals"],
      });
    }
  });

/**
 * Journal PUT: metadata-only update. Text/title must NOT be sent.
 */
export const journalUpdateSchema = z
  .object({
    id: z.string().min(1, "Entry ID is required"),
    updated_at: z.string().datetime().optional(),
    word_count: z.number().int().min(0).max(100000),
    local_hash: z.string().length(64, "local_hash must be 64-char hex (SHA-256)"),
    processing_mode: z.enum(["private", "signals_only"]),
    signals: OSSignalsArraySchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.processing_mode === "private" && data.signals && data.signals.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SIGNALS_NOT_ALLOWED_IN_PRIVATE_MODE",
        path: ["signals"],
      });
    }
  });

/**
 * Journal PATCH: retry enrichment for existing entry.
 */
export const journalRetryEnrichmentSchema = z
  .object({
    id: z.string().min(1, "Entry ID is required"),
  })
  .strict();

/** Check if a raw payload contains forbidden text fields. Returns field name or null. */
export function journalPayloadContainsText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ["text", "title", "content", "body", "journal"]) {
    if (key in obj) return key;
  }
  return null;
}

// ======================
// Insights Routes
// ======================

/**
 * Insights patterns: replace z.any() with typed/bounded schema.
 */
export const insightsPatternRequestSchema = z
  .object({
    userId: z.string().nullable().optional(),
    planTier: z.enum(["free", "pro", "elite"]).default("free"),
    checkins: z
      .array(
        z.object({
          id: z.string().optional(),
          date: z.string().optional(),
          createdAt: z.string().optional(),
          mood: z.number().min(0).max(10).nullable().optional(),
          stress: z.number().min(0).max(10).nullable().optional(),
          energy: z.number().min(0).max(10).nullable().optional(),
          focus: z.number().min(0).max(10).nullable().optional(),
          note: z.string().max(500, "Note cannot exceed 500 characters").default(""),
        })
      )
      .max(100, "Cannot process more than 100 check-ins at once")
      .default([]),
    language: z.string().max(10).optional(),
    locale: z.string().max(10).optional(),
    voiceModel: z.string().max(50).optional(),
    toneStyle: z.string().max(50).optional(),
    relationshipMode: z.string().max(50).optional(),
  })
  .strict();

/**
 * Insights generate: replace z.any() with typed/bounded schema.
 */
export const insightsGenerateRequestSchema = z
  .object({
    userId: z.string().nullable().optional(),
    planTier: z.enum(["free", "pro", "elite"]).default("free"),
    checkins: z
      .array(
        z.object({
          id: z.string().optional(),
          date: z.string(),
          mood: z.number().min(0).max(10).optional(),
          stress: z.number().min(0).max(10).optional(),
          focus: z.number().min(0).max(10).optional(),
          energy: z.number().min(0).max(10).optional(),
          note: z.string().max(500, "Note cannot exceed 500 characters").optional(),
          createdAt: z.string().optional(),
        })
      )
      .max(100, "Cannot process more than 100 check-ins at once")
      .default([]),
    // Bounded unknown for patterns: allow any shape, but cap array/string sizes
    patterns: z
      .object({
        commonPrimaryEmotions: z.array(z.string().max(100)).max(20).optional(),
        commonTriggers: z.array(z.string().max(100)).max(20).optional(),
        commonFears: z.array(z.string().max(100)).max(20).optional(),
        emotionalTendencies: z.array(z.string().max(100)).max(20).optional(),
      })
      .optional(),
    timezone: z.string().max(100).optional().nullable(),
    journal: z.string().max(10000).optional().nullable(),
    mood: z.number().min(0).max(10).optional().nullable(),
    stress: z.number().min(0).max(10).optional().nullable(),
    energy: z.number().min(0).max(10).optional().nullable(),
    language: z.string().max(10).optional().nullable(),
    locale: z.string().max(10).optional().nullable(),
    voiceModel: z.string().max(50).optional().nullable(),
    toneStyle: z.string().max(50).optional().nullable(),
    relationshipMode: z.string().max(50).optional().nullable(),
    behaviourVector: z
      .object({
        autonomy: z.number().min(0).max(1).optional(),
        structure: z.number().min(0).max(1).optional(),
        social: z.number().min(0).max(1).optional(),
        analytical: z.number().min(0).max(1).optional(),
      })
      .optional(),
    monitoring: z
      .object({
        riskLevel: z.number().min(0).max(10).optional().nullable(),
        fatigueLevel: z.number().min(0).max(10).optional().nullable(),
        clarity: z.number().min(0).max(1).optional().nullable(),
        tensionLoad: z.number().min(0).max(10).optional().nullable(),
      })
      .optional()
      .nullable(),
  })
  .strict();

// ======================
// Stripe Routes
// ======================

/**
 * Stripe create-checkout-session: plan must be a valid enum.
 * Target plan must be pro or elite (free has no checkout).
 */
export const stripeCheckoutSessionSchema = z
  .object({
    plan: z.enum(["pro", "elite"], { message: "Plan must be 'pro' or 'elite'" }),
    email: z.string().email("Invalid email format").max(255, "Email too long").optional().nullable(),
  })
  .strict();

/**
 * @deprecated Use stripeTopupCheckoutSchema with SKU naming instead.
 * Stripe token pack: packId must be a valid enum.
 * Legacy naming: pack_small, pack_medium, pack_large
 */
export const stripeTokenPackSchema = z
  .object({
    packId: z.enum(["pack_small", "pack_medium", "pack_large"], { message: "Invalid packId" }),
    email: z.string().email("Invalid email format").max(255, "Email too long").optional().nullable(),
  })
  .strict();

/**
 * Stripe top-up checkout: sku must be a valid top-up SKU.
 * SKU naming: topup_50k, topup_200k, topup_1m
 */
export const stripeTopupCheckoutSchema = z
  .object({
    sku: z.enum(["topup_50k", "topup_200k", "topup_1m"], { message: "Invalid SKU. Must be topup_50k, topup_200k, or topup_1m" }),
    email: z.string().email("Invalid email format").max(255, "Email too long").optional().nullable(),
  })
  .strict();

// ======================
// Admin Login (if exists)
// ======================

/**
 * Admin login: email and password with reasonable caps.
 */
export const adminLoginSchema = z
  .object({
    email: z.string().email("Invalid email format").max(255, "Email too long"),
    password: z.string().min(1, "Password is required").max(255, "Password too long"),
  })
  .strict();
