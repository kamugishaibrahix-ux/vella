import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  subscription_id: z.string().min(1),
  plan: z.string().min(1),
});

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "subscriptions-update-plan", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    // Get existing subscription
    const { data: existing, error: selectError } = await supabase
      .from("subscriptions")
      .select("plan, user_id")
      .eq("id", payload.subscription_id)
      .single();

    if (selectError) {
      throw selectError;
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Subscription not found." },
        { status: 404 },
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

    // Log the change
    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "subscriptions.update-plan",
      previous: { plan: existing.plan },
      next: { plan: payload.plan },
    });

    if (logError) {
      console.warn("[api/admin/subscriptions/update-plan] Failed to log activity", logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({ success: true, data: { subscription_id: payload.subscription_id } });
  } catch (error) {
    console.error(error);
    let message = "Failed to update subscription plan.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

