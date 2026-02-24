import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

// Plan to token entitlement mapping
const PLAN_ENTITLEMENTS: Record<string, number> = {
  Free: 5000,
  Pro: 40000,
  Elite: 120000,
  basic: 5000,
  pro: 40000,
  premium: 120000,
};

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "subscriptions-bulk-recalculate", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();

    // Get all subscriptions
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan, status");

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    let processed = 0;
    let errors = 0;
    const errorsList: string[] = [];

    // Process each subscription
    for (const sub of subscriptions ?? []) {
      try {
        const plan = sub.plan ?? "Free";
        const planKey = plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
        const entitlement = PLAN_ENTITLEMENTS[plan] ?? PLAN_ENTITLEMENTS[planKey] ?? 5000;

        // Get current user metadata
        const { data: userMeta, error: userMetaError } = await supabase
          .from("user_metadata")
          .select("token_balance, tokens_per_month")
          .eq("user_id", sub.user_id)
          .single();

        if (userMetaError) {
          errors++;
          errorsList.push(`User ${sub.user_id}: ${userMetaError.message}`);
          continue;
        }

        const previousBalance = userMeta.token_balance ?? 0;
        const newBalance = entitlement;

        // Update user_metadata
        const { error: updateError } = await supabase
          .from("user_metadata")
          .update({
            token_balance: newBalance,
            tokens_per_month: entitlement,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", sub.user_id);

        if (updateError) {
          errors++;
          errorsList.push(`User ${sub.user_id}: ${updateError.message}`);
          continue;
        }

        // Log admin activity
        await supabase.from("admin_activity_log").insert({
          admin_id: ADMIN_ACTOR_ID,
          action: "subscriptions.bulk-recalculate",
          previous: { token_balance: previousBalance, tokens_per_month: userMeta.tokens_per_month },
          next: { token_balance: newBalance, tokens_per_month: entitlement },
        });

        processed++;
      } catch (err) {
        errors++;
        errorsList.push(`Subscription ${sub.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed,
        errors,
        errors_list: errorsList,
      },
    });
  } catch (error) {
    console.error("[api/admin/subscriptions/bulk-recalculate] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to recalculate entitlements." },
      { status: 500 },
    );
  }
}

