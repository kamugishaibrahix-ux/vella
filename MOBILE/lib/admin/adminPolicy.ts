// This file contains server-only functions that must be called via dynamic import in client components
// Types are exported from adminPolicyTypes.ts to avoid server-only import issues

import type { AdminUserPolicy, AdminRuntimeLimits } from "./adminPolicyTypes";
import { resolvePlanTier } from "@/lib/tiers/planUtils";

// Re-export types for convenience
export type { AdminUserPolicy, AdminRuntimeLimits } from "./adminPolicyTypes";

// Default safe values when admin data is unavailable
const DEFAULT_POLICY: Omit<AdminUserPolicy, "userId"> = {
  isDisabled: false,
  planTier: "free",
  monthlyTokenLimit: null,
  hardTokenCap: null,
  realtimeEnabled: true,
  canStartSession: true,
  notes: null,
};

// Default runtime limits (matching current MOBILE behavior)
const DEFAULT_LIMITS: AdminRuntimeLimits = {
  maxSessionTokens: 2000, // reasonable default
  maxDailySessions: 50, // generous default
  maxRealtimeMinutesPerDay: 120, // 2 hours default
  softWarnAtUsageRatio: 0.75,
  hardBlockAtUsageRatio: 0.95,
};

// Internal types for Supabase row mapping
type UserMetadataRow = {
  user_id: string;
  plan?: string | null;
  token_balance?: number | null;
  status?: string | null;
  voice_enabled?: boolean | null;
  realtime_beta?: boolean | null;
  tokens_per_month?: number | null;
  notes?: string | null;
  [key: string]: unknown;
};

type SubscriptionRow = {
  user_id: string;
  plan?: string | null;
  monthly_token_allocation?: number | null;
  token_balance?: number | null;
  [key: string]: unknown;
};

/**
 * Loads admin user policy.
 * Local-first: always returns safe defaults.
 */
export async function loadAdminUserPolicy(userId: string): Promise<AdminUserPolicy> {
  // Local-first: no Supabase, return safe defaults
  return {
    userId,
    ...DEFAULT_POLICY,
  };
}

/**
 * Loads admin runtime limits.
 * Local-first: always returns safe defaults.
 */
export async function loadAdminRuntimeLimits(userId: string): Promise<AdminRuntimeLimits> {
  // Local-first: no Supabase, return safe defaults
  return DEFAULT_LIMITS;
}

