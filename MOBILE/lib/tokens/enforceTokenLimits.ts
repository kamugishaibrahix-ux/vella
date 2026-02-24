/**
 * Token enforcement: real blocking when quota exceeded.
 * Uses Supabase token_usage for durable storage. Fails closed when uncertain.
 */
import type { PlanTier } from "@/lib/tiers/planUtils";
import { getPlanLimits } from "@/lib/tiers/tierLimits";
import { getServerUsageForUser, recordUsageToSupabase, type UsageChannel } from "@/lib/budget/usageServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { chargeTokens } from "./chargeTokens";

const SAFETY_MULTIPLIER = 1.2;
const PER_REQUEST_CEILING = 100_000;

export type TokenAvailabilityResult = {
  allowed: boolean;
  remaining: number;
  mode: "enforced" | "unavailable";
};

export type TokenChargeResult = {
  success: boolean;
  remaining: number;
  consumedFromAllocation: number;
  consumedFromBalance: number;
  mode: "enforced" | "unavailable";
};

function isStorageAvailable(): boolean {
  return supabaseAdmin != null;
}

/**
 * Check if tokens are available before an AI operation. Blocks when quota exceeded.
 * Fails closed: denies when Supabase unavailable or when uncertain.
 */
export async function checkTokenAvailability(
  userId: string,
  planTier: PlanTier,
  estimatedTokens: number,
  route: string,
  channel: UsageChannel = "text",
): Promise<TokenAvailabilityResult> {
  const ceiling = Math.min(estimatedTokens * SAFETY_MULTIPLIER, PER_REQUEST_CEILING);
  const effectiveEstimate = Math.ceil(ceiling);

  if (!isStorageAvailable()) {
    return { allowed: false, remaining: 0, mode: "unavailable" };
  }

  const limits = getPlanLimits(planTier);
  const usage = await getServerUsageForUser(userId);

  if (channel === "text") {
    const limit = limits.monthlyTextTokens;
    const used = usage.textUsed;
    const remaining = Math.max(0, limit - used);
    const allowed = remaining >= effectiveEstimate;
    return { allowed, remaining, mode: "enforced" };
  }

  if (channel === "realtime_voice") {
    const limitSec = limits.monthlyVoiceMinutes * 60;
    if (limitSec <= 0) return { allowed: false, remaining: 0, mode: "enforced" };
    const estimatedSeconds = effectiveEstimate / 20;
    const used = usage.voiceSecondsUsed;
    const remaining = Math.max(0, limitSec - used);
    const allowed = remaining >= estimatedSeconds;
    return { allowed, remaining: Math.floor(remaining), mode: "enforced" };
  }

  if (channel === "audio") {
    const limit = limits.monthlyAudioClips;
    if (limit <= 0) return { allowed: false, remaining: 0, mode: "enforced" };
    const used = usage.audioClipsUsed;
    const remaining = Math.max(0, limit - used);
    const allowed = remaining >= 1;
    return { allowed, remaining: Math.floor(remaining), mode: "enforced" };
  }

  return { allowed: false, remaining: 0, mode: "enforced" };
}

/**
 * Charge tokens after successful operation. Persists to Supabase.
 */
export async function chargeTokensForOperation(
  userId: string,
  plan: "free" | "pro" | "elite",
  estimatedTokens: number,
  operationName: string,
  route: string,
  channel: UsageChannel = "text",
): Promise<TokenChargeResult> {
  const fromAllocation = plan !== "free";

  if (isStorageAvailable()) {
    try {
      if (channel === "text") {
        await recordUsageToSupabase({
          userId,
          channel: "text",
          textTokens: estimatedTokens,
          route,
          fromAllocation,
        });
      } else if (channel === "realtime_voice") {
        const seconds = Math.ceil(estimatedTokens / 20);
        await recordUsageToSupabase({
          userId,
          channel: "realtime_voice",
          realtimeSeconds: seconds,
          route,
          fromAllocation,
        });
      } else if (channel === "audio") {
        await recordUsageToSupabase({
          userId,
          channel: "audio",
          audioClips: 1,
          route,
          fromAllocation,
        });
      }
    } catch (err) {
      console.error("[enforceTokenLimits] Failed to persist usage", err);
    }
  }

  await chargeTokens(userId, plan, {
    textTokens: channel === "text" ? estimatedTokens : undefined,
    realtimeSeconds: channel === "realtime_voice" ? Math.ceil(estimatedTokens / 20) : undefined,
    audioClips: channel === "audio" ? 1 : undefined,
    route,
  });

  const usage = isStorageAvailable() ? await getServerUsageForUser(userId) : { textUsed: 0, voiceSecondsUsed: 0, audioClipsUsed: 0 };
  const limits = getPlanLimits(plan);
  const remaining = channel === "text"
    ? Math.max(0, limits.monthlyTextTokens - usage.textUsed)
    : channel === "realtime_voice"
      ? Math.max(0, limits.monthlyVoiceMinutes * 60 - usage.voiceSecondsUsed)
      : Math.max(0, limits.monthlyAudioClips - usage.audioClipsUsed);

  return {
    success: true,
    remaining,
    consumedFromAllocation: fromAllocation ? estimatedTokens : 0,
    consumedFromBalance: 0,
    mode: "enforced",
  };
}

export function getTokenWarningThreshold(_planTier: PlanTier): number {
  return 0.8;
}
