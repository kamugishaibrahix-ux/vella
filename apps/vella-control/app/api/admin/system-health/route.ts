import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "system-health", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Count error logs in last 24h
    const { count: errorCount, error: errorLogsError } = await supabase
      .from("system_logs")
      .select("*", { count: "exact", head: true })
      .eq("type", "error")
      .gte("created_at", last24h.toISOString());

    if (errorLogsError) {
      throw errorLogsError;
    }

    // Count info logs in last 24h
    const { count: infoCount, error: infoLogsError } = await supabase
      .from("system_logs")
      .select("*", { count: "exact", head: true })
      .eq("type", "info")
      .gte("created_at", last24h.toISOString());

    if (infoLogsError) {
      throw infoLogsError;
    }

    // Get db_load from analytics_counters
    const { data: dbLoadData, error: dbLoadError } = await supabase
      .from("analytics_counters")
      .select("value")
      .eq("key", "db_load")
      .single();

    if (dbLoadError && dbLoadError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine
      throw dbLoadError;
    }

    const dbLoad = dbLoadData?.value ?? null;

    // Determine status: operational if errors < 10 (threshold)
    const errorThreshold = 10;
    const status = (errorCount ?? 0) < errorThreshold ? "operational" : "degraded";

    return NextResponse.json({
      success: true,
      data: {
        error_count_24h: errorCount ?? 0,
        info_count_24h: infoCount ?? 0,
        db_load: dbLoad,
        status,
      },
    });
  } catch (error) {
    console.error("[api/admin/system-health] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load system health." },
      { status: 500 },
    );
  }
}

