/**
 * Execution Spine — Layer 2 Validation (Phase 1)
 * Zod schemas for commitment creation, status changes, and outcome logging.
 * Separate from governance validation — does NOT modify governance schemas.
 * All payloads metadata-only; no free-text fields.
 */

import { z } from "zod";
import {
  COMMITMENT_DOMAIN_CODES,
  CADENCE_TYPES,
  TARGET_TYPES,
  COMMITMENT_STATUSES,
  OUTCOME_CODES,
} from "./types";

const MAX_CODE_LENGTH = 50;

const uuidString = z.string().uuid();

const isoTimestampString = z
  .string()
  .max(MAX_CODE_LENGTH)
  .refine(
    (s) => /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s),
    { message: "Invalid ISO timestamp" }
  );

const codeString = z
  .string()
  .max(MAX_CODE_LENGTH)
  .regex(/^[a-zA-Z0-9_-]+$/, "Only enum/code characters allowed");

// ---------------------------------------------------------------------------
// Create commitment
// ---------------------------------------------------------------------------

export const CreateCommitmentSchema = z
  .object({
    commitment_code: codeString,
    subject_code: z.enum(COMMITMENT_DOMAIN_CODES),
    target_type: z.enum(TARGET_TYPES),
    target_value: z.number().min(0).max(10000),
    cadence_type: z.enum(CADENCE_TYPES),
    start_at: isoTimestampString,
    end_at: isoTimestampString.nullable().optional(),
    deadline_at: isoTimestampString.nullable().optional(),
  })
  .strict();

export type CreateCommitmentInput = z.infer<typeof CreateCommitmentSchema>;

// ---------------------------------------------------------------------------
// Change status
// ---------------------------------------------------------------------------

export const ChangeStatusSchema = z
  .object({
    commitment_id: uuidString,
    new_status: z.enum(["paused", "active", "completed", "abandoned"]),
  })
  .strict();

export type ChangeStatusInput = z.infer<typeof ChangeStatusSchema>;

// ---------------------------------------------------------------------------
// Log outcome
// ---------------------------------------------------------------------------

export const LogOutcomeSchema = z
  .object({
    commitment_id: uuidString,
    outcome_code: z.enum(OUTCOME_CODES),
    occurred_at_iso: isoTimestampString.optional(),
    window_start_iso: isoTimestampString.optional(),
    window_end_iso: isoTimestampString.optional(),
  })
  .strict();

export type LogOutcomeInput = z.infer<typeof LogOutcomeSchema>;
