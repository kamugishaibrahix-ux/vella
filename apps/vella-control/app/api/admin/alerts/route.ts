import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "alerts", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get error logs from last 24h
    const { data: errorLogs, error: errorLogsError } = await supabase
      .from("system_logs")
      .select("*")
      .eq("type", "error")
      .gte("created_at", last24h.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (errorLogsError) {
      throw errorLogsError;
    }

    // Map logs to alert objects
    const alerts = (errorLogs ?? []).map((log) => {
      // Determine severity from log type or use error as default
      let severity: "info" | "warning" | "error" = "error";
      const typeLower = (log.type ?? "").toLowerCase();
      if (typeLower.includes("warn")) {
        severity = "warning";
      } else if (typeLower.includes("info")) {
        severity = "info";
      }

      return {
        id: log.id,
        title: log.message ?? log.action ?? "System alert",
        details: log.message ?? log.action ?? "No details available",
        severity,
        source: "System",
        timestamp: log.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error("[api/admin/alerts] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load alerts." },
      { status: 500 },
    );
  }
}

