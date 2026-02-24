import { NextResponse } from "next/server";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "tokens-list", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("token_usage")
      .select("*")
      .order("used_at", { ascending: false });

    return NextResponse.json({ data, error });
  } catch (err: any) {
    console.error("[admin/tokens/list] unexpected error", err);
    return NextResponse.json(
      {
        data: null,
        error: { message: err?.message ?? "unexpected_error" },
      },
      { status: 500 },
    );
  }
}
