import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "insights-overview", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();

    // Calculate date thresholds
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Total users
    const { count: totalUsers, error: usersError } = await supabase
      .from("user_metadata")
      .select("*", { count: "exact", head: true });

    if (usersError) {
      throw usersError;
    }

    // Active users in last 24h
    const { count: activeUsers24h, error: activeUsersError } = await supabase
      .from("user_metadata")
      .select("*", { count: "exact", head: true })
      .gte("last_active_at", last24h);

    if (activeUsersError) {
      throw activeUsersError;
    }

    // Active subscriptions
    const { count: activeSubscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .in("status", ["active", "trialing", "paused"]);

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    // Tokens used in last 7 days
    const { data: tokenUsageData, error: tokenUsageError } = await supabase
      .from("token_usage")
      .select("tokens")
      .gte("used_at", last7d);

    if (tokenUsageError) {
      throw tokenUsageError;
    }

    const tokensUsed7d = (tokenUsageData ?? []).reduce((sum, row) => sum + (row.tokens ?? 0), 0);

    // Feedback in last 30 days
    const { count: feedbackLast30d, error: feedbackError } = await supabase
      .from("feedback")
      .select("*", { count: "exact", head: true })
      .gte("created_at", last30d);

    if (feedbackError) {
      // Feedback table might not exist, treat as 0
      console.warn("[insights/overview] Feedback query failed", feedbackError);
    }

    // Admin actions in last 7 days
    const { count: adminActions7d, error: adminActionsError } = await supabase
      .from("admin_activity_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", last7d);

    if (adminActionsError) {
      throw adminActionsError;
    }

    // System errors in last 7 days (best-effort filter)
    const { data: systemLogsData, error: systemLogsError } = await supabase
      .from("system_logs")
      .select("type, action")
      .gte("created_at", last7d);

    if (systemLogsError) {
      throw systemLogsError;
    }

    const errors7d = (systemLogsData ?? []).filter((log) => {
      const type = (log.type ?? "").toLowerCase();
      const action = (log.action ?? "").toLowerCase();
      return type.includes("error") || type.includes("warning") || action.includes("error");
    }).length;

    return NextResponse.json({
      success: true,
      data: {
        totals: {
          totalUsers: totalUsers ?? 0,
          activeUsers24h: activeUsers24h ?? 0,
          activeSubscriptions: activeSubscriptions ?? 0,
        },
        usage: {
          tokensUsed7d,
        },
        feedback: {
          feedbackLast30d: feedbackLast30d ?? 0,
        },
        admin: {
          adminActions7d: adminActions7d ?? 0,
        },
        system: {
          errors7d,
        },
      },
    });
  } catch (error) {
    console.error("[insights/overview] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load insights overview." },
      { status: 500 },
    );
  }
}

