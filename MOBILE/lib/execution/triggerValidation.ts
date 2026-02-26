/**
 * Execution Spine — Phase 2: Trigger log payload validation.
 * Strict Zod schema for trigger_fired event metadata.
 * Separate from governance validation.
 */

import { z } from "zod";
import { TRIGGER_TYPES, COMMITMENT_DOMAIN_CODES, SUPPRESSION_REASON_CODES } from "./types";

const MAX_CODE_LENGTH = 50;

const uuidString = z.string().uuid();

const isoTimestampString = z
  .string()
  .max(MAX_CODE_LENGTH)
  .refine(
    (s) => /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s),
    { message: "Invalid ISO timestamp" }
  );

const idempotencyKeyString = z
  .string()
  .min(10)
  .max(200);

export const TriggerLogSchema = z
  .object({
    commitment_id: uuidString,
    domain_code: z.enum(COMMITMENT_DOMAIN_CODES),
    trigger_type: z.enum(TRIGGER_TYPES),
    window_start_iso: isoTimestampString,
    window_end_iso: isoTimestampString,
    idempotency_key: idempotencyKeyString,
  })
  .strict();

export type TriggerLogInput = z.infer<typeof TriggerLogSchema>;

export const TriggerSuppressedSchema = z
  .object({
    commitment_id: uuidString,
    domain_code: z.enum(COMMITMENT_DOMAIN_CODES),
    trigger_type: z.enum(TRIGGER_TYPES),
    window_start_iso: isoTimestampString,
    reason_code: z.enum(SUPPRESSION_REASON_CODES),
    idempotency_key: idempotencyKeyString,
  })
  .strict();

export type TriggerSuppressedInput = z.infer<typeof TriggerSuppressedSchema>;
