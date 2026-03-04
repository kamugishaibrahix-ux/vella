import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { type PlanTier, getTierTokenLimit, isValidPlanTier } from "@vella/contract";
import { logSecurityEvent } from "@/lib/telemetry/securityEvents";


const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

function buildAuditMetadata(request: Request): Record<string, string> {
  return {
    admin_ip: request.headers.get("x-forwarded-for") || "unknown",
    user_agent: request.headers.get("user-agent") || "unknown",
    request_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate plan to canonical PlanTier. No alias mapping.
 * Null plan → "free" (no subscription). Unknown strings → null (corruption).
 */
function validatePlanForRecalc(plan: string | null): PlanTier | null {
  if (!plan) return "free";
  const normalized = plan.toLowerCase().trim();
  if (isValidPlanTier(normalized)) return normalized;
  return null;
}

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
    const corruptedUsers: string[] = [];
    const auditMeta = buildAuditMetadata(request);

    for (const sub of subscriptions ?? []) {
      try {
        const tier = validatePlanForRecalc(sub.plan);

        if (!tier) {
          logSecurityEvent("BULK_RECALC_CORRUPTION", { user_id: sub.user_id, plan: sub.plan, request_id: auditMeta.request_id });
          corruptedUsers.push(sub.user_id);
          errorsList.push(`Subscription ${sub.id}: TIER_CORRUPTION – unknown plan "${sub.plan}"`);
          continue;
        }

        const entitlement = getTierTokenLimit(tier);

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

        await supabase.from("admin_activity_log").insert({
          admin_id: ADMIN_ACTOR_ID,
          action: "subscriptions.bulk-recalculate",
          previous: { token_balance: previousBalance, tokens_per_month: userMeta.tokens_per_month },
          next: { token_balance: newBalance, tokens_per_month: entitlement, delta: newBalance - previousBalance },
          target_user_id: sub.user_id,
          metadata: auditMeta,
        });

        processed++;
      } catch (err) {
        errors++;
        errorsList.push(`Subscription ${sub.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    if (corruptedUsers.length > 0) {
      return NextResponse.json({
        success: false,
        error: "TIER_CORRUPTION_DETECTED",
        corrupted_count: corruptedUsers.length,
        corrupted_users: corruptedUsers,
        processed,
        errors,
        errors_list: errorsList,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        processed,
        errors,
        errors_list: errorsList,
        token_limits: {
          free: getTierTokenLimit("free"),
          pro: getTierTokenLimit("pro"),
          elite: getTierTokenLimit("elite"),
        },
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
