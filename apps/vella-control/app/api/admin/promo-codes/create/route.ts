import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const bodySchema = z.object({
  code: z.string().min(1),
  discount_percent: z.number().int().min(1).max(100),
  applies_to_plan: z.string().min(1),
  usage_limit: z.number().int().positive().optional(),
  expires_at: z.string().optional(),
});

const ADMIN_ACTOR_ID = process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "promo-codes-create", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload = bodySchema.parse(await request.json());
    const supabase = getAdminClient();

    const { data: promoCode, error: insertError } = await supabase
      .from("promo_codes")
      .insert({
        code: payload.code,
        discount_percent: payload.discount_percent,
        applies_to_plan: payload.applies_to_plan,
        usage_limit: payload.usage_limit ?? null,
        expires_at: payload.expires_at ?? null,
        is_active: true,
        times_used: 0,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "promo_codes.create",
      previous: null,
      next: { promo_code_id: promoCode.id, code: payload.code },
      metadata: {
        admin_ip: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      data: promoCode,
    });
  } catch (error) {
    console.error("[api/admin/promo-codes/create] Error", error);
    let message = "Failed to create promo code.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

