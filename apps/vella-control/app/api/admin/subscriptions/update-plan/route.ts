import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { VALID_PLAN_TIERS, assertValidPlanTier } from "@vella/contract";

/**
 * STRICT Zod schema for subscription plan updates.
 * HARDENING:
 * - Tier must be one of VALID_PLAN_TIERS (free/pro/elite)
 * - Unknown tiers are rejected
 * - override_stripe flag required for active Stripe subscriptions
 */
const bodySchema = z.object({
  subscription_id: z.string().min(1, "Subscription ID is required"),
  plan: z.enum(["free", "pro", "elite"], {
    errorMap: () => ({ 
      message: `Invalid tier. Must be one of: ${VALID_PLAN_TIERS.join(", ")}` 
    }),
  }),
  override_stripe: z.boolean().optional().default(false),
  reason: z.string().max(500).optional(),
});

type BodySchema = z.infer<typeof bodySchema>;

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

/**
 * Get subscription details including Stripe status.
 */
async function getSubscriptionDetails(
  supabase: ReturnType<typeof getAdminClient>,
  subscriptionId: string
): Promise<{ 
  exists: boolean; 
  userId?: string; 
  currentPlan?: string;
  stripeSubscriptionId?: string;
  stripeStatus?: string;
  hasActiveStripe: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan, stripe_subscription_id, status")
      .eq("id", subscriptionId)
      .single();

    if (error || !data) {
      return { exists: false, hasActiveStripe: false };
    }

    const hasActiveStripe = !!data.stripe_subscription_id && 
      ["active", "trialing", "past_due"].includes(data.status);

    return {
      exists: true,
      userId: data.user_id,
      currentPlan: data.plan,
      stripeSubscriptionId: data.stripe_subscription_id || undefined,
      stripeStatus: data.status,
      hasActiveStripe,
    };
  } catch {
    return { exists: false, hasActiveStripe: false };
  }
}

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    const adminUserId = await getAdminUserId();
    await rateLimitAdmin(request, "subscriptions-update-plan", adminUserId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload: BodySchema = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    // Get subscription details
    const subDetails = await getSubscriptionDetails(supabase, payload.subscription_id);

    if (!subDetails.exists) {
      return NextResponse.json(
        { success: false, error: "Subscription not found." },
        { status: 404 }
      );
    }

    // HARDENING: Validate existing plan from DB
    if (subDetails.currentPlan) {
      try {
        assertValidPlanTier(subDetails.currentPlan, "subscriptions.update-plan/existing");
      } catch {
        console.error("[ADMIN_TIER_CORRUPTION]", {
          subscription_id: payload.subscription_id,
          corrupted_plan: subDetails.currentPlan,
        });
        return NextResponse.json(
          { success: false, error: "Existing plan is corrupted. Investigate before updating.", code: "TIER_CORRUPTION" },
          { status: 500 }
        );
      }
    }

    // STRIPE SAFETY CHECK
    if (subDetails.hasActiveStripe && !payload.override_stripe) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Cannot change plan - subscription has active Stripe subscription.",
          details: {
            stripe_subscription_id: subDetails.stripeSubscriptionId,
            current_status: subDetails.stripeStatus,
            message: "Use Stripe dashboard or set override_stripe: true with explicit reason.",
          },
          code: "STRIPE_SUBSCRIPTION_ACTIVE",
        },
        { status: 409 }
      );
    }

    // Log warning if override is used
    if (subDetails.hasActiveStripe && payload.override_stripe) {
      console.warn(
        `[ADMIN OVERRIDE] Admin ${ADMIN_ACTOR_ID} bypassing Stripe subscription ` +
        `${subDetails.stripeSubscriptionId} for subscription ${payload.subscription_id}. ` +
        `Reason: ${payload.reason || "No reason provided"}`
      );
    }

    // Update subscription plan
    const { error: updateError } = await supabase
      .from("subscriptions")
      .update({
        plan: payload.plan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.subscription_id);

    if (updateError) {
      throw updateError;
    }

    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "subscriptions.update-plan",
      target_user_id: subDetails.userId,
      previous: { 
        plan: subDetails.currentPlan,
        subscription_id: payload.subscription_id,
        had_stripe_subscription: subDetails.hasActiveStripe,
        stripe_subscription_id: subDetails.stripeSubscriptionId,
      },
      next: { 
        plan: payload.plan,
        override_used: subDetails.hasActiveStripe && payload.override_stripe,
        override_reason: payload.reason,
      },
      metadata: {
        admin_ip: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });

    if (logError) {
      console.warn("[subscriptions/update-plan] Failed to write audit log:", logError);
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        subscription_id: payload.subscription_id,
        previous_plan: subDetails.currentPlan,
        new_plan: payload.plan,
        stripe_override_used: subDetails.hasActiveStripe && payload.override_stripe,
      },
    });
  } catch (error) {
    console.error("[subscriptions/update-plan] Error:", error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json(
        { success: false, error: `Validation error: ${issues}` },
        { status: 400 }
      );
    }
    
    const message = error instanceof Error ? error.message : "Failed to update subscription plan.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
