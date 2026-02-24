/**
 * Usage engine summary:
 * - Persists usage via localStorage (local-first).
 * - Uses local storage keys for token usage tracking.
 */

import { logTokenUsage } from "@/lib/tokens/logTokenUsage";
import type { PlanTier } from "@/lib/tiers/planUtils";
import { loadLocal } from "@/lib/local/storage";
import { getCounterState } from "@/lib/budget/counterEngine";

export type UsageChannel = "text" | "realtime_voice" | "audio";

export interface BudgetLimits {
  textTokensPerMonth: number;
  realtimeSecondsPerMonth: number;
}

export interface BudgetState {
  channel: UsageChannel;
  period: "month";
  usedTextTokens: number;
  usedRealtimeSeconds: number;
  remainingTextTokens: number;
  remainingRealtimeSeconds: number;
  hardBlocked: boolean;
  softWarning: boolean;
}

export function getBudgetLimitsForPlan(plan: PlanTier): BudgetLimits {
  switch (plan) {
    case "elite":
      return {
        textTokensPerMonth: 1_000_000,
        realtimeSecondsPerMonth: 18_000,
      };
    case "pro":
      return {
        textTokensPerMonth: 300_000,
        realtimeSecondsPerMonth: 3_600,
      };
    case "free":
    default:
      return {
        textTokensPerMonth: 50_000,
        realtimeSecondsPerMonth: 0,
      };
  }
}

const APPROX_REALTIME_TOKENS_PER_SECOND = 20;

export function approximateRealtimeTokens(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round(seconds * APPROX_REALTIME_TOKENS_PER_SECOND);
}

export interface UsageRecord {
  plan: "free" | "pro" | "elite";
  channel: "text" | "realtime_voice" | "audio";
  textTokens?: number;
  realtimeSeconds?: number;
  audioClips?: number;
  route?: string;
}

export async function recordUsage(userId: string, record: UsageRecord): Promise<void> {
  if (!userId) return;

  let tokens = 0;
  if (record.channel === "text") {
    tokens = Math.max(0, Math.round(record.textTokens ?? 0));
  } else if (record.channel === "realtime_voice") {
    tokens = approximateRealtimeTokens(record.realtimeSeconds ?? 0);
  } else if (record.channel === "audio") {
    // Audio clips: each clip costs 5000 tokens (matching chargeTokens.ts)
    const clips = record.audioClips ?? 0;
    tokens = clips * 5000;
    // Also add any text tokens if provided (for audio generation prompts)
    tokens += Math.max(0, Math.round(record.textTokens ?? 0));
  }

  if (tokens <= 0) return;

  // NEW unified logging format
  console.log("[usageEngine:recordUsage]", {
    userId,
    plan: record.plan,
    channel: record.channel,
    textTokens: record.textTokens ?? 0,
    realtimeSeconds: record.realtimeSeconds ?? 0,
    audioClips: record.audioClips ?? 0,
    route: record.route ?? "unknown",
  });

  try {
    await logTokenUsage({
      userId,
      tokens,
      event: `usage:${record.channel}${record.route ? `:${record.route}` : ""}`,
      fromAllocation: record.plan !== "free",
      // Pass structured fields for counter engine
      channel: record.channel,
      textTokens: record.textTokens,
      realtimeSeconds: record.realtimeSeconds,
      audioClips: record.audioClips,
      route: record.route,
    });
  } catch (error) {
    console.error("[UsageEngine] failed to log usage", error);
  }
}

export interface AggregatedUsage {
  textTokensUsed: number;
  realtimeSecondsUsed: number;
  audioClipsUsed: number;
}

export function computeBudgetState(
  channel: UsageChannel,
  plan: PlanTier,
  aggregated: AggregatedUsage,
): BudgetState {
  const limits = getBudgetLimitsForPlan(plan);
  const usedText = aggregated.textTokensUsed ?? 0;
  const usedRealtime =
    channel === "realtime_voice"
      ? aggregated.realtimeSecondsUsed ?? 0
      : 0;

  const remainingText = Math.max(0, limits.textTokensPerMonth - usedText);
  const remainingRealtime = Math.max(0, limits.realtimeSecondsPerMonth - usedRealtime);

  const softWarning =
    remainingText < limits.textTokensPerMonth * 0.1 ||
    (limits.realtimeSecondsPerMonth > 0 && remainingRealtime < limits.realtimeSecondsPerMonth * 0.1);

  const hardBlocked =
    remainingText <= 0 ||
    (limits.realtimeSecondsPerMonth > 0 && remainingRealtime <= 0);

  return {
    channel,
    period: "month",
    usedTextTokens: usedText,
    usedRealtimeSeconds: usedRealtime,
    remainingTextTokens: remainingText,
    remainingRealtimeSeconds: remainingRealtime,
    softWarning,
    hardBlocked,
  };
}

export async function fetchAggregatedUsageForUser(userId: string, planTier: PlanTier): Promise<AggregatedUsage> {
  if (!userId) {
    return { textTokensUsed: 0, realtimeSecondsUsed: 0, audioClipsUsed: 0 };
  }

  const counters = getCounterState(userId, planTier);

  return {
    textTokensUsed: counters.monthly.textUsed,
    realtimeSecondsUsed: counters.monthly.voiceSecondsUsed,
    audioClipsUsed: counters.monthly.audioClipsUsed,
  };
}

