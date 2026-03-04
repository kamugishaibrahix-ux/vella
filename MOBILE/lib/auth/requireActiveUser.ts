/**
 * Central enforcement layer for user access control.
 * Blocks suspended or invalid users from accessing token-consuming or AI-executing routes.
 * FAILS CLOSED: If Supabase unavailable or any uncertainty, access is blocked.
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeDbCall, isDbUnavailableError, dbUnavailableResponse } from "@/lib/server/safeDbCall";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import { isValidPlanTier, UnknownTierError } from "@/lib/plans/defaultEntitlements";

const ACCOUNT_INACTIVE_RESPONSE = NextResponse.json(
  { error: "account_inactive", code: "ACCOUNT_INACTIVE" },
  { status: 403 }
);

const PLAN_RESOLUTION_FAILED_RESPONSE = (userId: string) =>
  NextResponse.json(
    { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
    { status: 500 }
  );

export type ActiveUserResult =
  | { userId: string; plan: PlanTier; subscriptionStatus: string | null }
  | NextResponse;

/**
 * Require active, non-suspended user with valid subscription.
 * Returns user info on success, or 403 NextResponse on block.
 * Fails closed: any error or unavailable service results in block.
 *
 * Enforcement order (for AI routes):
 *   1. requireActiveUser (this function)
 *   2. checkTokenAvailability
 *   3. Call OpenAI
 *   4. chargeTokensForOperation
 */
export async function requireActiveUser(): Promise<ActiveUserResult> {
  // Step 1: Require authenticated user
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof NextResponse) {
    return userIdOr401;
  }
  const userId = userIdOr401;

  // Step 2: Check admin_user_flags for suspension
  // Step 3: Check subscriptions for status and plan
  // Both checks must pass; any failure blocks access

  if (!supabaseAdmin) {
    console.error("[requireActiveUser] Supabase admin unavailable - blocking access");
    return NextResponse.json(
      { error: "account_inactive", code: "SUPABASE_ADMIN_UNAVAILABLE", gate: "requireActiveUser:supabase_null" },
      { status: 403 }
    );
  }

  try {
    // Fetch admin_user_flags and subscriptions in parallel (wrapped for pool exhaustion)
    const [flagsResult, subscriptionResult] = await safeDbCall(
      () =>
        Promise.all([
          supabaseAdmin!
            .from("admin_user_flags")
            .select("suspended, suspended_at")
            .eq("user_id", userId)
            .maybeSingle(),
          supabaseAdmin!
            .from("subscriptions")
            .select("plan, status")
            .eq("user_id", userId)
            .maybeSingle(),
        ]),
      { operation: "requireActiveUser" },
    );

    // Check for query errors - fail closed
    if (flagsResult.error) {
      console.error("[requireActiveUser] Error fetching admin_user_flags:", flagsResult.error.message, (flagsResult.error as any).code, (flagsResult.error as any).details, (flagsResult.error as any).hint);
      return NextResponse.json(
        { error: "account_inactive", code: "FLAGS_QUERY_FAILED", gate: "requireActiveUser:flags_error", message: flagsResult.error.message },
        { status: 403 }
      );
    }

    if (subscriptionResult.error) {
      console.error("[requireActiveUser] Error fetching subscriptions:", subscriptionResult.error.message, (subscriptionResult.error as any).code, (subscriptionResult.error as any).details, (subscriptionResult.error as any).hint);
      return NextResponse.json(
        { error: "account_inactive", code: "SUBSCRIPTION_QUERY_FAILED", gate: "requireActiveUser:subscription_error", message: subscriptionResult.error.message },
        { status: 403 }
      );
    }

    const flags = flagsResult.data as { suspended?: boolean; suspended_at?: string | null } | null;
    const subscription = subscriptionResult.data as { plan?: string | null; status?: string | null } | null;

    // BLOCK: User is explicitly suspended
    if (flags?.suspended === true) {
      console.warn("[requireActiveUser] Blocked suspended user:", userId);
      return NextResponse.json(
        { error: "account_inactive", code: "USER_SUSPENDED", gate: "requireActiveUser:suspended" },
        { status: 403 }
      );
    }

    // Determine plan and subscription status
    // HARDENING: Validate plan from DB – never silently cast unknown strings to PlanTier
    const rawPlan = subscription?.plan ?? null;
    let plan: PlanTier;
    if (!rawPlan) {
      plan = "free";
    } else if (isValidPlanTier(rawPlan)) {
      plan = rawPlan;
    } else {
      console.error("[PLAN RESOLUTION FAILURE]", { userId, rawPlan });
      return PLAN_RESOLUTION_FAILED_RESPONSE(userId);
    }
    const subscriptionStatus = subscription?.status ?? null;

    // BLOCK: Subscription exists but is not active
    // Valid active statuses: "active", "trialing"
    // Note: We allow null (no subscription row) for free tier users
    if (subscriptionStatus !== null && subscriptionStatus !== "active" && subscriptionStatus !== "trialing") {
      console.warn("[requireActiveUser] Blocked user with inactive subscription:", {
        userId,
        status: subscriptionStatus,
      });
      return NextResponse.json(
        { error: "account_inactive", code: "SUBSCRIPTION_INACTIVE", gate: "requireActiveUser:inactive_sub", subscriptionStatus },
        { status: 403 }
      );
    }

    // Success: Return user info for downstream use
    return {
      userId,
      plan,
      subscriptionStatus,
    };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailableResponse();
    console.error("[requireActiveUser] Unexpected error:", err);
    return NextResponse.json(
      { error: "account_inactive", code: "UNEXPECTED_ERROR", gate: "requireActiveUser:catch", message: err instanceof Error ? err.message : String(err) },
      { status: 403 }
    );
  }
}

/**
 * Type guard: true if value is a blocked/error response from requireActiveUser.
 */
export function isActiveUserBlocked(value: ActiveUserResult): value is NextResponse {
  return value instanceof NextResponse;
}
