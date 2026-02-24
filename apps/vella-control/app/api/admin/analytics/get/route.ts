import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { fromSafe } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "analytics-get", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from("analytics_counters")
      .select("key, value");

    if (error) {
      throw error;
    }

    // Touch system_logs to ensure metadata wiring stays healthy.
    await supabase.from("system_logs").select("id").limit(1);

    // PHASE 11: Touch token_usage metadata table
    let tokenUsage = null;
    try {
      const { data: tokenData } = await fromSafe("token_usage")
        .select("id, tokens, from_allocation, created_at")
        .limit(20);
      tokenUsage = tokenData;
    } catch (err) {
      console.warn("[admin/analytics/get] token_usage query failed", err);
    }

    const counters = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));

    return NextResponse.json({ success: true, data: counters, tokenUsage });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load analytics counters." },
      { status: 500 },
    );
  }
}

