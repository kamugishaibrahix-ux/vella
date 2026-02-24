import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

// Hardcoded price map (safe to have in API)
const PLAN_PRICES: Record<string, number> = {
  Free: 0,
  Pro: 49,
  Elite: 199,
  basic: 0,
  pro: 49,
  premium: 199,
};

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "revenue", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();

    // Get all active subscriptions
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("status", "active");

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    // Group by plan and count
    const planCounts: Record<string, number> = {};
    (subscriptions ?? []).forEach((sub) => {
      const plan = sub.plan ?? "Unknown";
      planCounts[plan] = (planCounts[plan] ?? 0) + 1;
    });

    // Calculate MRR and per-plan totals
    const planTotals: Record<string, { count: number; mrr: number }> = {};
    let totalMRR = 0;

    Object.entries(planCounts).forEach(([plan, count]) => {
      const planKey = plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase();
      const price = PLAN_PRICES[plan] ?? PLAN_PRICES[planKey] ?? 0;
      const mrr = count * price;
      planTotals[plan] = { count, mrr };
      totalMRR += mrr;
    });

    return NextResponse.json({
      success: true,
      data: {
        mrr: totalMRR,
        plan_totals: planTotals,
      },
    });
  } catch (error) {
    console.error("[api/admin/revenue] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load revenue data." },
      { status: 500 },
    );
  }
}

