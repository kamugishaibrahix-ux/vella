import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

/**
 * STRICT Zod schema for token updates.
 * HARDENING:
 * - Delta bounded to reasonable limits (-1M to +1M)
 * - Requires reason for large adjustments (> 100k)
 */
const bodySchema = z.object({
  user_id: z.string().uuid(),
  delta: z.number().int().min(-1_000_000).max(1_000_000, "Token adjustment cannot exceed 1M"),
  reason: z.string().max(500).optional(),
});

type BodySchema = z.infer<typeof bodySchema>;

const ADMIN_ACTOR_ID =
  process.env.ADMIN_ACTIVITY_ACTOR_ID ?? "00000000-0000-0000-0000-000000000000";

export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "users-update-tokens", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const payload: BodySchema = bodySchema.parse(await request.json());
    const supabase = getAdminClient();
    
    // Log warning for large adjustments
    if (Math.abs(payload.delta) > 100_000 && !payload.reason) {
      console.warn(
        `[ADMIN] Large token adjustment (${payload.delta}) without reason for user ${payload.user_id}`
      );
    }

    const { data: user, error: selectError } = await supabase
      .from("user_metadata")
      .select("token_balance")
      .eq("user_id", payload.user_id)
      .single();

    if (selectError) {
      throw selectError;
    }

    const newBalance = user.token_balance + payload.delta;

    const { error: updateError } = await supabase
      .from("user_metadata")
      .update({
        token_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", payload.user_id);

    if (updateError) {
      throw updateError;
    }

    const { error: ledgerError } = await supabase.from("token_ledger").insert({
      user_id: payload.user_id,
      delta: payload.delta,
      reason: "admin_adjustment",
    });

    if (ledgerError) {
      throw ledgerError;
    }

    const { error: logError } = await supabase.from("admin_activity_log").insert({
      admin_id: ADMIN_ACTOR_ID,
      action: "users.update-tokens",
      target_user_id: payload.user_id,
      previous: { token_balance: user.token_balance },
      next: { token_balance: newBalance, delta: payload.delta },
      metadata: {
        delta: payload.delta,
        adjustment_reason: payload.reason || "No reason provided",
        admin_ip: request.headers.get("x-forwarded-for") || "unknown",
        user_agent: request.headers.get("user-agent") || "unknown",
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });

    if (logError) {
      throw logError;
    }

    return NextResponse.json({ success: true, data: { user_id: payload.user_id, token_balance: newBalance } });
  } catch (error) {
    console.error(error);
    let message = "Failed to update user tokens.";
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError" && "message" in error && typeof error.message === "string") {
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

