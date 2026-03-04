/**
 * Central source of truth for all plan-tier usage limits.
 * 
 * IMPORTANT:
 * - These limits are NOT enforced yet.
 * - Enforcement will be added in Phase 4.
 * - This file must remain pure and without side-effects.
 */

export type PlanTier = "free" | "pro" | "elite";

/**
 * Monthly & daily quota definitions for each plan tier.
 *
 * These represent:
 * - Text:   Monthly text token allowance
 * - Voice:  Monthly voice minutes + daily soft caps
 * - Audio:  Number of AI audio clips per month
 */
export const PLAN_LIMITS = {
  free: {
    monthlyTextTokens: 10000,        // 10k text tokens per month (matches DEFAULT_FREE_ENTITLEMENTS)
    monthlyVoiceMinutes: 0,          // Free tier has no voice access
    dailyVoiceSoftCapMinutes: 0,     // No soft cap because voice is disabled
    monthlyAudioClips: 0,            // Free audio generation not allowed
  },

  pro: {
    monthlyTextTokens: 300000,       // 300k monthly text tokens
    monthlyVoiceMinutes: 60,         // Up to 60 minutes total per month
    dailyVoiceSoftCapMinutes: 10,    // Soft cap of ~10 minutes voice per day
    monthlyAudioClips: 30,           // Up to 30 audio clips per month
  },

  elite: {
    monthlyTextTokens: 1000000,      // 1 million monthly text tokens
    monthlyVoiceMinutes: 200,        // Up to ~3h20m voice per month
    dailyVoiceSoftCapMinutes: 30,    // Soft cap of 30 minutes per day
    monthlyAudioClips: 120,          // 120 audio clips per month
  },
} as const;

export type PlanLimits = typeof PLAN_LIMITS;

/**
 * Small helper for convenient lookup.
 */
export function getPlanLimits(tier: PlanTier) {
  return PLAN_LIMITS[tier];
}

