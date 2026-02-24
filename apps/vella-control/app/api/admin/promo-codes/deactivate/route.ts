import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  id: z.string().uuid(),
});

const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "promo-codes-deactivate", userId);
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

    // Deactivate: set is_active = false
    const { data: updatedPromo, error: updateError } = await supabase
      .from("promo_codes")
      .update({ is_active: false })
      .eq("id", payload.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log admin activity
    await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "promo_codes.deactivate",
      previous: { is_active: currentPromo.is_active },
      next: { is_active: false },
    });

    return NextResponse.json({
      success: true,
      data: updatedPromo,
    });
  } catch (error) {
    console.error("[api/admin/promo-codes/deactivate] Error", error);
    let message = "Failed to deactivate promo code.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

