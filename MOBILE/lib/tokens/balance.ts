/**
 * Canonical Token Balance Resolver
 * Single source of truth for token availability.
 *
 * Formula: remaining = max(0, allowance + topups − usage)
 * Where all values are scoped to the current billing window.
 */

import type { PlanTier } from "@/lib/plans/types";
import { resolvePlanEntitlements } from "@/lib/plans/resolvePlanEntitlements";
import { resolveBillingWindow, type BillingWindow } from "@/lib/billing/billingWindow";
import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";

export interface TokenBalance {
  remaining: number;
  allowance: number;
  topups: number;
  used: number;
  window: BillingWindow;
}

export interface TokenBalanceResult {
  balance: TokenBalance | null;
  error: string | null;
  mode: "computed" | "fail_closed";
}

/**
 * Get token balance for a user within their billing window.
 *
 * Logic:
 * 1. Resolve billing window
 * 2. Get plan entitlements (allowance)
 * 3. Sum token_usage within window
 * 4. Sum token_topups within window
 * 5. Compute: remaining = max(0, allowance + topups - used)
 *
 * Fail-closed: returns error if billing window cannot be determined
 *
 * @param userId - The user to get balance for
 * @param planTier - The user's plan tier
 * @returns TokenBalanceResult with balance or error
 */
export async function getTokenBalanceForUser(
  userId: string,
  planTier: PlanTier
): Promise<TokenBalanceResult> {
  try {
    // Step 1: Resolve billing window
    const window = await resolveBillingWindow(userId);
    if (!window) {
      return {
        balance: null,
        error: "Cannot determine billing window",
        mode: "fail_closed",
      };
    }

    // Step 2: Get plan entitlements (allowance)
    const entitlementsResult = await resolvePlanEntitlements(planTier);
    const allowance = entitlementsResult.entitlements.maxMonthlyTokens;

    // Step 3 & 4: Sum usage and topups within window
    const [used, topups] = await Promise.all([
      sumUsageInWindow(userId, window),
      sumTopupsInWindow(userId, window),
    ]);

    // Step 5: Compute remaining
    const remaining = Math.max(0, allowance + topups - used);

    return {
      balance: {
        remaining,
        allowance,
        topups,
        used,
        window,
      },
      error: null,
      mode: "computed",
    };
  } catch (error) {
    console.error("[getTokenBalanceForUser] Unexpected error:", error);
    return {
      balance: null,
      error: error instanceof Error ? error.message : "Unknown error",
      mode: "fail_closed",
    };
  }
}

/**
 * Sum token_usage within billing window.
 */
async function sumUsageInWindow(userId: string, window: BillingWindow): Promise<number> {
  if (!supabaseAdmin) {
    console.error("[sumUsageInWindow] Supabase admin not available");
    return 0;
  }

  try {
    const { data, error } = await fromSafe("token_usage")
      .select("tokens")
      .eq("user_id", userId)
      .gte("created_at", window.start.toISOString())
      .lt("created_at", window.end.toISOString());

    if (error) {
      console.error("[sumUsageInWindow] Error fetching usage:", error.message);
      return 0;
    }

    const rows = data as { tokens: number }[] | null;
    if (!rows) return 0;

    return rows.reduce((sum, row) => sum + (row.tokens ?? 0), 0);
  } catch (error) {
    console.error("[sumUsageInWindow] Unexpected error:", error);
    return 0;
  }
}

/**
 * Sum token_topups within billing window.
 */
async function sumTopupsInWindow(userId: string, window: BillingWindow): Promise<number> {
  if (!supabaseAdmin) {
    console.error("[sumTopupsInWindow] Supabase admin not available");
    return 0;
  }

  try {
    const { data, error } = await fromSafe("token_topups")
      .select("tokens_awarded")
      .eq("user_id", userId)
      .gte("created_at", window.start.toISOString())
      .lt("created_at", window.end.toISOString());

    if (error) {
      console.error("[sumTopupsInWindow] Error fetching topups:", error.message);
      return 0;
    }

    const rows = data as { tokens_awarded: number }[] | null;
    if (!rows) return 0;

    return rows.reduce((sum, row) => sum + (row.tokens_awarded ?? 0), 0);
  } catch (error) {
    console.error("[sumTopupsInWindow] Unexpected error:", error);
    return 0;
  }
}

/**
 * Format balance for logging/debugging.
 */
export function formatTokenBalance(balance: TokenBalance): string {
  return `remaining=${balance.remaining} (allowance=${balance.allowance} + topups=${balance.topups} - used=${balance.used})`;
}
