import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  user_id: z.string().uuid(),
  flagged: z.boolean(),
});

const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "users-flag-review", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    const { data: user, error: selectError } = await supabase
      .from("user_metadata")
      .select("flagged_for_review")
      .eq("user_id", payload.user_id)
      .single();

    if (selectError) {
      throw selectError;
    }

    const { error: updateError } = await supabase
      .from("user_metadata")
      .update({
        flagged_for_review: payload.flagged,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", payload.user_id);

    if (updateError) {
      throw updateError;
    }

    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "users.flag-review",
      target_user_id: payload.user_id,
      previous: { flagged_for_review: user.flagged_for_review },
      next: { flagged_for_review: payload.flagged },
      metadata: {
        admin_ip: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });

    if (logError) {
      console.warn("[users/flag-review] Failed to write audit log:", logError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    let message = "Failed to update flag status.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

