import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { VALID_PLAN_TIERS, assertValidPlanTier } from "@vella/contract";

/**
 * STRICT Zod schema for plan updates.
 * HARDENING:
 * - Tier must be one of VALID_PLAN_TIERS (free/pro/elite)
 * - Unknown tiers are rejected, not silently accepted
 * - override_stripe flag required for Stripe-active users
 */
const bodySchema = z.object({
  user_id: z.string().uuid(),
  new_plan: z.enum(["free", "pro", "elite"], {
    errorMap: () => ({ 
      message: `Invalid tier. Must be one of: ${VALID_PLAN_TIERS.join(", ")}` 
    }),
  }),
  override_stripe: z.boolean().optional().default(false),
  reason: z.string().max(500).optional(), // Optional admin note
});

type BodySchema = z.infer<typeof bodySchema>;

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

/**
 * Check if user has an active Stripe subscription.
 * If they do, plan changes should go through Stripe or require explicit override.
 */
async function hasActiveStripeSubscription(
  supabase: ReturnType<typeof getAdminClient>,
  userId: string
): Promise<{ hasSubscription: boolean; subscriptionId?: string; status?: string }> {
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, status, stripe_subscription_id")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return { hasSubscription: false };
    }

    return {
      hasSubscription: true,
      subscriptionId: data.stripe_subscription_id || data.id,
      status: data.status,
    };
  } catch {
    return { hasSubscription: false };
  }
}

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  
  try {
    const adminUserId = await getAdminUserId();
    await rateLimitAdmin(request, "users-update-plan", adminUserId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload: BodySchema = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    // Get existing user data
    const { data: existing, error: selectError } = await supabase
      .from("user_metadata")
      .select("plan, user_id")
      .eq("user_id", payload.user_id)
      .single();

    if (selectError) {
      return NextResponse.json(
        { success: false, error: "User not found." },
        { status: 404 }
      );
    }

    // HARDENING: Validate existing plan from DB
    if (existing.plan) {
      try {
        assertValidPlanTier(existing.plan, "users.update-plan/existing");
      } catch {
        console.error("[ADMIN_TIER_CORRUPTION]", {
          user_id: payload.user_id,
          corrupted_plan: existing.plan,
        });
        return NextResponse.json(
          { success: false, error: "Existing plan is corrupted. Investigate before updating.", code: "TIER_CORRUPTION" },
          { status: 500 }
        );
      }
    }

    // STRIPE SAFETY CHECK
    const stripeCheck = await hasActiveStripeSubscription(supabase, payload.user_id);
    
    if (stripeCheck.hasSubscription && !payload.override_stripe) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Cannot change plan - user has active Stripe subscription.",
          details: {
            stripe_subscription_id: stripeCheck.subscriptionId,
            status: stripeCheck.status,
            message: "Use Stripe dashboard or set override_stripe: true with explicit reason.",
          },
          code: "STRIPE_SUBSCRIPTION_ACTIVE",
        },
        { status: 409 }
      );
    }

    // Log warning if override is used
    if (stripeCheck.hasSubscription && payload.override_stripe) {
      console.warn(
        `[ADMIN OVERRIDE] Admin ${ADMIN_ACTOR_ID} bypassing Stripe subscription ` +
        `for user ${payload.user_id}. Reason: ${payload.reason || "No reason provided"}`
      );
    }

    // Update user plan
    const { error: updateError } = await supabase
      .from("user_metadata")
      .update({
        plan: payload.new_plan,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", payload.user_id);

    if (updateError) {
      throw updateError;
    }

    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "users.update-plan",
      target_user_id: payload.user_id,
      previous: { 
        plan: existing.plan,
        had_stripe_subscription: stripeCheck.hasSubscription,
        stripe_subscription_id: stripeCheck.subscriptionId,
      },
      next: { 
        plan: payload.new_plan,
        override_used: stripeCheck.hasSubscription && payload.override_stripe,
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
      console.warn("[users/update-plan] Failed to write audit log:", logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        user_id: payload.user_id,
        previous_plan: existing.plan,
        new_plan: payload.new_plan,
        stripe_override_used: stripeCheck.hasSubscription && payload.override_stripe,
      },
    });
  } catch (error) {
    console.error("[users/update-plan] Error:", error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json(
        { success: false, error: `Validation error: ${issues}` },
        { status: 400 }
      );
    }
    
    // Handle other errors
    const message = error instanceof Error ? error.message : "Failed to update user plan.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
