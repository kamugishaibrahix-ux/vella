/**
 * Governance Validation Guard
 * Strict validation for all governance writes. Ensures:
 * - Supabase stores safe metadata only
 * - No free-text; all codes from enum/allowlist
 * - No nested narrative JSON; reject unknown keys
 * Server-only (used from API/events); no "use server" so sync validators are allowed.
 */

import { z } from "zod";

const MAX_STRING_LENGTH = 50;

/** ISO 8601 timestamp string (date or datetime), max 50 chars */
const isoTimestampString = z
  .string()
  .max(MAX_STRING_LENGTH)
  .refine(
    (s) => /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s),
    { message: "Invalid ISO timestamp" }
  );

/** UUID string for user_id and FKs */
const uuidString = z.string().uuid();

/** Code string: alphanumeric + underscore only, max 50 (for metadata values) */
const codeString = z
  .string()
  .max(MAX_STRING_LENGTH)
  .regex(/^[a-zA-Z0-9_-]+$/, "Only enum/code characters allowed");

/** Optional metadata object: keys and values only primitives (number, code string, timestamp). No nested objects. */
const metadataValue = z.union([
  z.number(),
  codeString,
  isoTimestampString,
]);
const governanceMetadataSchema = z
  .record(z.string().max(MAX_STRING_LENGTH), metadataValue)
  .optional();

// ---------------------------------------------------------------------------
// Allowlist enums (extend these as product adds new codes)
// ---------------------------------------------------------------------------

export const GOVERNANCE_EVENT_TYPES = [
  "commitment_created",
  "commitment_completed",
  "commitment_violation",
  "abstinence_start",
  "abstinence_violation",
  "focus_start",
  "focus_end",
  "scheduler_tick",
  "weekly_focus_checkin",
  "commitment_outcome_logged",
  "commitment_status_changed",
  "trigger_fired",
  "trigger_suppressed",
] as const;

export const GOVERNANCE_COMMITMENT_CODES = [
  "no_smoking",
  "no_alcohol",
  "focus_block",
  "habit_daily",
  "custom",
] as const;

export const GOVERNANCE_SUBJECT_CODES = [
  "smoking",
  "alcohol",
  "focus",
  "habit",
  "other",
] as const;

export const GOVERNANCE_OUTCOME_CODES = [
  "completed",
  "abandoned",
  "skipped",
  "expired",
] as const;

export const GOVERNANCE_TARGET_STATUS = [
  "active",
  "paused",
  "completed",
  "abandoned",
] as const;

// ---------------------------------------------------------------------------
// Insert/Update schemas (strict, known keys only)
// ---------------------------------------------------------------------------

export const BehaviourEventInsertSchema = z
  .object({
    user_id: uuidString,
    event_type: z.enum(GOVERNANCE_EVENT_TYPES),
    occurred_at: isoTimestampString,
    commitment_id: uuidString.optional(),
    subject_code: z.enum(GOVERNANCE_SUBJECT_CODES).optional(),
    metadata_code: governanceMetadataSchema,
  })
  .strict();

export const CommitmentInsertSchema = z
  .object({
    user_id: uuidString,
    commitment_code: z.enum(GOVERNANCE_COMMITMENT_CODES),
    subject_code: z.enum(GOVERNANCE_SUBJECT_CODES).optional(),
    target_type: codeString.optional(),
    target_value: z.number().optional(),
    start_at: isoTimestampString,
    end_at: isoTimestampString.optional(),
    status: z.enum(GOVERNANCE_TARGET_STATUS).optional(),
  })
  .strict();

export const AbstinenceTargetInsertSchema = z
  .object({
    user_id: uuidString,
    subject_code: z.enum(GOVERNANCE_SUBJECT_CODES),
    start_at: isoTimestampString,
    target_metric: z.number().optional(),
    status: z.enum(GOVERNANCE_TARGET_STATUS).optional(),
  })
  .strict();

export const FocusSessionInsertSchema = z
  .object({
    user_id: uuidString,
    started_at: isoTimestampString,
    ended_at: isoTimestampString,
    duration_seconds: z.number().int().min(0),
    outcome_code: z.enum(GOVERNANCE_OUTCOME_CODES),
  })
  .strict();

/** Governance state JSON: only allowed keys; values are number, code string, or timestamp. No nested objects beyond one level. */
const governanceStateJsonSchema = z.record(
  z.string().max(MAX_STRING_LENGTH),
  z.union([z.number(), codeString, isoTimestampString])
);

export const GovernanceStateUpdateSchema = z
  .object({
    user_id: uuidString,
    state_json: governanceStateJsonSchema,
    last_computed_at: isoTimestampString.optional(),
    updated_at: isoTimestampString.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type BehaviourEventInsert = z.infer<typeof BehaviourEventInsertSchema>;
export type CommitmentInsert = z.infer<typeof CommitmentInsertSchema>;
export type AbstinenceTargetInsert = z.infer<typeof AbstinenceTargetInsertSchema>;
export type FocusSessionInsert = z.infer<typeof FocusSessionInsertSchema>;
export type GovernanceStateUpdate = z.infer<typeof GovernanceStateUpdateSchema>;

export type GovernanceSchemaName =
  | "BehaviourEventInsert"
  | "CommitmentInsert"
  | "AbstinenceTargetInsert"
  | "FocusSessionInsert"
  | "GovernanceStateUpdate";

const SCHEMA_MAP: Record<GovernanceSchemaName, z.ZodType<unknown>> = {
  BehaviourEventInsert: BehaviourEventInsertSchema,
  CommitmentInsert: CommitmentInsertSchema,
  AbstinenceTargetInsert: AbstinenceTargetInsertSchema,
  FocusSessionInsert: FocusSessionInsertSchema,
  GovernanceStateUpdate: GovernanceStateUpdateSchema,
};

/**
 * Validates a payload against the given governance schema.
 * Use before any DB write for behaviour_events, commitments, abstinence_targets, focus_sessions, governance_state.
 *
 * @param schemaName - One of the five governance schema names
 * @param payload - Raw payload to validate
 * @returns Parsed payload (typed, stripped of unknown keys)
 * @throws ZodError when validation fails (unknown keys, wrong types, free-text, etc.)
 */
export function validateGovernancePayload<T>(
  schemaName: GovernanceSchemaName,
  payload: unknown
): T {
  const schema = SCHEMA_MAP[schemaName];
  if (!schema) {
    throw new Error(`[governance/validation] Unknown schema: ${schemaName}`);
  }
  return schema.parse(payload) as T;
}

/**
 * Safe parse variant: returns { success: true, data } or { success: false, error }.
 * Use when you prefer not to throw.
 */
export function validateGovernancePayloadSafe<T>(
  schemaName: GovernanceSchemaName,
  payload: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const schema = SCHEMA_MAP[schemaName];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: z.ZodIssueCode.custom,
          message: `Unknown schema: ${schemaName}`,
          path: [],
        },
      ]) as z.ZodError,
    };
  }
  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data as T };
  }
  return { success: false, error: result.error };
}
