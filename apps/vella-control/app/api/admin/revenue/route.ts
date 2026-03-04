import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { calculateMRR, getMonthlyPriceDollars, isValidPlanTier } from "@vella/contract";

/**
 * Normalize plan name for revenue calculations.
 * Handles various casings and returns valid PlanTier or null.
 */
function normalizePlanForPricing(plan: string | null): string | null {
  if (!plan) return null;
  
  const normalized = plan.toLowerCase().trim();
  
  // Handle legacy aliases
  if (normalized === "basic") return "free";
  if (normalized === "premium") return "elite";
  
  // Check if it's a valid tier
  if (isValidPlanTier(normalized)) {
    return normalized;
  }
  
  return null; // Unknown tier - won't contribute to MRR
}

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

    // Group by normalized plan and count
    const tierCounts: Record<string, number> = {};
    const unknownPlans: string[] = [];
    
    (subscriptions ?? []).forEach((sub) => {
      const normalizedTier = normalizePlanForPricing(sub.plan);
      
      if (normalizedTier) {
        tierCounts[normalizedTier] = (tierCounts[normalizedTier] ?? 0) + 1;
      } else if (sub.plan) {
        // Track unknown plans for admin visibility
        unknownPlans.push(sub.plan);
      }
    });

    // Calculate MRR using shared pricing contract
    const { tiers, totalMRR } = calculateMRR(tierCounts);

    // Build plan_totals in the format expected by the UI
    const planTotals: Record<string, { count: number; mrr: number; price: number }> = {};
    
    for (const tier of tiers) {
      planTotals[tier.tier] = {
        count: tier.count,
        mrr: tier.mrr,
        price: tier.pricePerUser,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        mrr: totalMRR,
        plan_totals: planTotals,
        // Include pricing info for transparency
        pricing_config: {
          free: getMonthlyPriceDollars("free"),
          pro: getMonthlyPriceDollars("pro"),
          elite: getMonthlyPriceDollars("elite"),
        },
        // Warn about unknown plans
        ...(unknownPlans.length > 0 && {
          warnings: [`Unknown plans found: ${Array.from(new Set(unknownPlans)).join(", ")}. These do not contribute to MRR.`],
        }),
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
