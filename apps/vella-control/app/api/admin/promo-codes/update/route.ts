import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
  usage_limit: z.number().int().positive().optional(),
  expires_at: z.string().nullable().optional(),
});

const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "promo-codes-update", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    // Get current state
    const { data: currentPromo, error: selectError } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("id", payload.id)
      .single();

    if (selectError) {
      throw selectError;
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active;
    }
    if (payload.usage_limit !== undefined) {
      updateData.usage_limit = payload.usage_limit;
    }
    if (payload.expires_at !== undefined) {
      updateData.expires_at = payload.expires_at;
    }

    const { data: updatedPromo, error: updateError } = await supabase
      .from("promo_codes")
      .update(updateData)
      .eq("id", payload.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log admin activity
    await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "promo_codes.update",
      previous: {
        is_active: currentPromo.is_active,
        usage_limit: currentPromo.usage_limit,
        expires_at: currentPromo.expires_at,
      },
      next: {
        is_active: updatedPromo.is_active,
        usage_limit: updatedPromo.usage_limit,
        expires_at: updatedPromo.expires_at,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedPromo,
    });
  } catch (error) {
    console.error("[api/admin/promo-codes/update] Error", error);
    let message = "Failed to update promo code.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

