import { z } from "zod";

export const reasoningDepthEnum = z.enum(["Light", "Normal", "Analytical", "Deep"]);

/**
 * Minimal admin config schema for local-first architecture.
 * Only includes runtime guardrails, safety controls, and global flags.
 * All persona/behaviour/voice tuning removed - handled locally per-device.
 */
export const adminConfigSchema = z.object({
  // Runtime Configuration
  models: z.object({
    text_model: z.string(),
    realtime_model: z.string(),
    embedding_model: z.string(),
    reasoning_depth: reasoningDepthEnum,
  }),
  model: z.object({
    temperature: z.number().min(0).max(2),
    max_output: z.number().min(200).max(4000),
  }),

  // Safety & Guardrails
  safety: z.object({
    safety_strictness: z.number().min(0).max(100),
    red_flag_sensitivity: z.number().min(0).max(100),
    attachment_prevention: z.boolean(),
    hallucination_reducer: z.boolean(),
    destabilization_guard: z.boolean(),
  }),

  // Global System Flags
  flags: z.object({
    maintenanceMode: z.boolean(),
    enableVoice: z.boolean(),
    enableRealtime: z.boolean(),
    enableMusicMode: z.boolean(),
  }),

  // Token Limits (global defaults)
  limits: z.object({
    maxDailyTokensPerUser: z.number().min(1000).max(1000000),
  }),
});

export type AdminConfigInput = z.infer<typeof adminConfigSchema>;
