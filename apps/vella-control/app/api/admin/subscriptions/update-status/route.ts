import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  subscription_id: z.string().min(1),
  status: z.enum(["active", "canceled", "cancelled", "past_due", "trialing", "paused"]),
});

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "subscriptions-update-status", userId);
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
      .select("status, user_id")
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

    // Normalize status (handle both "canceled" and "cancelled")
    const normalizedStatus = payload.status === "cancelled" ? "canceled" : payload.status;

    // Update subscription status
    const updateData: { status: string; updated_at: string; cancel_at?: string | null } = {
      status: normalizedStatus,
      updated_at: new Date().toISOString(),
    };

    // Set cancel_at if cancelling
    if (normalizedStatus === "canceled") {
      updateData.cancel_at = new Date().toISOString();
    } else if (normalizedStatus === "active" && existing.status === "canceled") {
      // Reactivating - clear cancel_at
      updateData.cancel_at = null;
    }

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update(updateData)
      .eq("id", payload.subscription_id);

    if (updateError) {
      throw updateError;
    }

    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "subscriptions.update-status",
      target_user_id: existing.user_id,
      previous: { status: existing.status },
      next: { status: normalizedStatus },
      metadata: {
        admin_ip: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });

    if (logError) {
      console.warn("[api/admin/subscriptions/update-status] Failed to log activity", logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({ success: true, data: { subscription_id: payload.subscription_id } });
  } catch (error) {
    console.error(error);
    let message = "Failed to update subscription status.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

