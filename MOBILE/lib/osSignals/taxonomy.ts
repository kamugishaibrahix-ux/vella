/**
 * OS Signal Taxonomy — strict, deterministic signal codes aligned to FocusDomains.
 * No free-text. All fields are enums or bounded numbers.
 */

import { z } from "zod";
import type { FocusDomain } from "@/lib/focusAreas";

// ---------------------------------------------------------------------------
// Signal severity
// ---------------------------------------------------------------------------

export const SIGNAL_SEVERITIES = ["low", "moderate", "high"] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

// ---------------------------------------------------------------------------
// Signal codes grouped by FocusDomain
// ---------------------------------------------------------------------------

export const SIGNAL_CODES = [
  // self-mastery
  "SM_DISCIPLINE_LAPSE",
  "SM_ROUTINE_BREAK",
  "SM_IMPULSE_SURGE",
  "SM_HABIT_STREAK_RISK",
  "SM_DIGITAL_OVERUSE",
  // addiction-recovery
  "AR_URGE_MENTION",
  "AR_RELAPSE_RISK",
  "AR_CRAVING_SPIKE",
  "AR_ISOLATION_PATTERN",
  "AR_RECOVERY_DOUBT",
  // emotional-intelligence
  "EI_ANXIETY_ELEVATED",
  "EI_ANGER_SPIKE",
  "EI_MOOD_INSTABILITY",
  "EI_STRESS_OVERLOAD",
  "EI_OVERWHELM",
  // relationships
  "RE_CONFLICT_MENTION",
  "RE_LONELINESS_SIGNAL",
  "RE_TRUST_EROSION",
  "RE_COMMUNICATION_BREAKDOWN",
  "RE_BOUNDARY_VIOLATION",
  // performance-focus
  "PF_FOCUS_DECLINE",
  "PF_PROCRASTINATION",
  "PF_BURNOUT_RISK",
  "PF_PRODUCTIVITY_DROP",
  "PF_MOTIVATION_LOSS",
  // identity-purpose
  "IP_PURPOSE_DOUBT",
  "IP_VALUES_CONFLICT",
  "IP_DIRECTION_LOST",
  "IP_MEANING_VOID",
  // physical-health
  "PH_SLEEP_DISRUPTION",
  "PH_ENERGY_DEPLETION",
  "PH_EXERCISE_SKIP",
  "PH_BODY_NEGLECT",
  "PH_FATIGUE_CHRONIC",
  // financial-discipline
  "FD_IMPULSE_SPEND",
  "FD_BUDGET_BREACH",
  "FD_FINANCIAL_ANXIETY",
  "FD_SAVINGS_DRAIN",
] as const;

export type SignalCode = (typeof SIGNAL_CODES)[number];

// ---------------------------------------------------------------------------
// Domain → code mapping (for validation / lookup)
// ---------------------------------------------------------------------------

export const DOMAIN_SIGNAL_MAP: Record<FocusDomain, readonly SignalCode[]> = {
  "self-mastery": ["SM_DISCIPLINE_LAPSE", "SM_ROUTINE_BREAK", "SM_IMPULSE_SURGE", "SM_HABIT_STREAK_RISK", "SM_DIGITAL_OVERUSE"],
  "addiction-recovery": ["AR_URGE_MENTION", "AR_RELAPSE_RISK", "AR_CRAVING_SPIKE", "AR_ISOLATION_PATTERN", "AR_RECOVERY_DOUBT"],
  "emotional-intelligence": ["EI_ANXIETY_ELEVATED", "EI_ANGER_SPIKE", "EI_MOOD_INSTABILITY", "EI_STRESS_OVERLOAD", "EI_OVERWHELM"],
  relationships: ["RE_CONFLICT_MENTION", "RE_LONELINESS_SIGNAL", "RE_TRUST_EROSION", "RE_COMMUNICATION_BREAKDOWN", "RE_BOUNDARY_VIOLATION"],
  "performance-focus": ["PF_FOCUS_DECLINE", "PF_PROCRASTINATION", "PF_BURNOUT_RISK", "PF_PRODUCTIVITY_DROP", "PF_MOTIVATION_LOSS"],
  "identity-purpose": ["IP_PURPOSE_DOUBT", "IP_VALUES_CONFLICT", "IP_DIRECTION_LOST", "IP_MEANING_VOID"],
  "physical-health": ["PH_SLEEP_DISRUPTION", "PH_ENERGY_DEPLETION", "PH_EXERCISE_SKIP", "PH_BODY_NEGLECT", "PH_FATIGUE_CHRONIC"],
  "financial-discipline": ["FD_IMPULSE_SPEND", "FD_BUDGET_BREACH", "FD_FINANCIAL_ANXIETY", "FD_SAVINGS_DRAIN"],
};

// ---------------------------------------------------------------------------
// OSSignal type
// ---------------------------------------------------------------------------

export type OSSignal = {
  domain: FocusDomain;
  code: SignalCode;
  severity: SignalSeverity;
  confidence: number; // 0–100
  source: "journal";
};

// ---------------------------------------------------------------------------
// Zod schemas (strict)
// ---------------------------------------------------------------------------

export const OSSignalSchema = z
  .object({
    domain: z.enum([
      "self-mastery",
      "addiction-recovery",
      "emotional-intelligence",
      "relationships",
      "performance-focus",
      "identity-purpose",
      "physical-health",
      "financial-discipline",
    ]),
    code: z.enum(SIGNAL_CODES),
    severity: z.enum(SIGNAL_SEVERITIES),
    confidence: z.number().int().min(0).max(100),
    source: z.literal("journal"),
  })
  .strict();

export const OSSignalsArraySchema = z.array(OSSignalSchema).max(8);
