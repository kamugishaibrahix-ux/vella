import type { PlanTier } from "@/lib/tiers/planUtils";

/**
 * Admin user policy - controls user access and capabilities based on admin settings.
 */
export interface AdminUserPolicy {
  userId: string;
  isDisabled: boolean; // hard block, admin toggle
  planTier: PlanTier; // "free" | "pro" | "elite"
  monthlyTokenLimit: number | null; // max tokens allowed per month from plan
  hardTokenCap: number | null; // optional admin override cap
  realtimeEnabled: boolean; // whether voice sessions are allowed
  canStartSession: boolean; // derived: !isDisabled
  notes?: string | null; // optional, admin-side notes (no user text)
}

/**
 * Admin runtime limits - controls per-session and daily usage caps.
 */
export interface AdminRuntimeLimits {
  maxSessionTokens: number; // per-session ceiling
  maxDailySessions: number; // daily cap for sessions
  maxRealtimeMinutesPerDay: number; // voice minutes cap
  softWarnAtUsageRatio: number; // ratio at which to warn user (0–1)
  hardBlockAtUsageRatio: number; // ratio at which to hard-block
}









