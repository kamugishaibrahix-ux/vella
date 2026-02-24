import { getCounterState } from "@/lib/budget/counterEngine";
import { getPlanLimits } from "@/lib/tiers/tierLimits";

/**
 * Provides the REAL token state based on:
 * - Plan tier limits (PLAN_LIMITS)
 * - Local usage logs (counterEngine.ts)
 *
 * This is NOT enforcing any limits.
 * It computes the remaining amounts only.
 * Enforcement will be added in Phase 4.
 */
export async function getUserTokenState(userId: string | null, planTier: "free" | "pro" | "elite") {
  if (!userId) {
    const limits = getPlanLimits("free");
    return {
      text: {
        used: 0,
        remaining: limits.monthlyTextTokens,
        limit: limits.monthlyTextTokens,
        usedToday: 0,
      },
      voice: {
        usedSeconds: 0,
        remainingSeconds: limits.monthlyVoiceMinutes * 60,
        usedTodaySeconds: 0,
        limitSeconds: limits.monthlyVoiceMinutes * 60,
      },
      audio: {
        usedClips: 0,
        remainingClips: limits.monthlyAudioClips,
        usedTodayClips: 0,
        limitClips: limits.monthlyAudioClips,
      },
      warnings: {
        nearingLimit: false,
        atLimit: false,
      },
    };
  }

  const counters = getCounterState(userId, planTier);
  const limits = getPlanLimits(planTier);

  return {
    text: {
      used: counters.monthly.textUsed,
      remaining: counters.monthly.textRemaining,
      limit: limits.monthlyTextTokens,
      usedToday: counters.daily.textUsedToday,
    },
    voice: {
      usedSeconds: counters.monthly.voiceSecondsUsed,
      remainingSeconds: counters.monthly.voiceSecondsRemaining,
      usedTodaySeconds: counters.daily.voiceSecondsUsedToday,
      limitSeconds: limits.monthlyVoiceMinutes * 60,
    },
    audio: {
      usedClips: counters.monthly.audioClipsUsed,
      remainingClips: counters.monthly.audioClipsRemaining,
      usedTodayClips: counters.daily.audioClipsUsedToday,
      limitClips: limits.monthlyAudioClips,
    },
    warnings: counters.warnings,
  };
}


