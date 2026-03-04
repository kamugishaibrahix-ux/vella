/**
 * GET /api/account/token-balance
 * Returns current user's token balance within billing window.
 * Backend is authoritative - frontend uses this for visibility only.
 */

import { NextResponse } from "next/server";
import { requireActiveUser, isActiveUserBlocked } from "@/lib/auth/requireActiveUser";
import { getTokenBalanceForUser } from "@/lib/tokens/balance";
import { safeErrorLog } from "@/lib/security/logGuard";

/**
 * Fail-safe: return zero balance if something goes wrong.
 * Backend will enforce actual restrictions.
 */
const FAIL_SAFE_BALANCE = {
  remaining: 0,
  allowance: 0,
  topups: 0,
  used: 0,
  window: {
    start: new Date().toISOString(),
    end: new Date().toISOString(),
    source: "fail_safe" as const,
  },
  source: "fail_safe" as const,
};

export async function GET() {
  try {
    // Step 1: Require active user
    const activeResult = await requireActiveUser();
    if (isActiveUserBlocked(activeResult)) {
      return activeResult;
    }

    const { userId, plan } = activeResult;

    // Step 2: Get token balance
    const balanceResult = await getTokenBalanceForUser(userId, plan);

    if (balanceResult.error || !balanceResult.balance) {
      // Return fail-safe but don't crash UI
      console.warn("[TOKEN_BALANCE_TRACE]", { userId, plan, error: balanceResult.error, mode: balanceResult.mode });
      safeErrorLog("[api/account/token-balance] Balance unavailable, returning fail-safe", {
        error: balanceResult.error,
      });
      return NextResponse.json(FAIL_SAFE_BALANCE);
    }

    const { balance } = balanceResult;

    const payload = {
      remaining: balance.remaining ?? 0,
      allowance: balance.allowance ?? 0,
      topups: balance.topups ?? 0,
      used: balance.used ?? 0,
      window: {
        start: balance.window.start.toISOString(),
        end: balance.window.end.toISOString(),
        source: balance.window.source,
      },
      source: balanceResult.mode,
    };

    console.info("[TOKEN_BALANCE_TRACE]", { userId, plan, remaining: payload.remaining, allowance: payload.allowance, used: payload.used, topups: payload.topups, source: payload.source });

    return NextResponse.json(payload);
  } catch (error) {
    // Fail-safe: return zero balance
    safeErrorLog("[api/account/token-balance] Error, returning fail-safe", error);
    return NextResponse.json(FAIL_SAFE_BALANCE);
  }
}
