import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "engagement", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const supabase = getAdminClient();
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get token usage per day
    const { data: tokenUsage, error: tokenUsageError } = await supabase
      .from("token_usage")
      .select("tokens, created_at")
      .gte("created_at", last30Days.toISOString())
      .order("created_at", { ascending: true });

    if (tokenUsageError) {
      throw tokenUsageError;
    }

    // Get feedback per day
    const { data: feedback, error: feedbackError } = await supabase
      .from("feedback")
      .select("created_at")
      .gte("created_at", last30Days.toISOString())
      .order("created_at", { ascending: true });

    if (feedbackError) {
      throw feedbackError;
    }

    // Get system_logs to estimate active sessions (unique user_ids or session_ids)
    const { data: systemLogs, error: systemLogsError } = await supabase
      .from("system_logs")
      .select("created_at")
      .gte("created_at", last30Days.toISOString())
      .order("created_at", { ascending: true });

    if (systemLogsError) {
      throw systemLogsError;
    }

    // Aggregate by day
    const dailyData: Record<string, { tokens: number; feedback: number; sessions: number }> = {};

    // Process token usage
    (tokenUsage ?? []).forEach((entry) => {
      const date = new Date(entry.created_at).toISOString().split("T")[0];
      if (!dailyData[date]) {
        dailyData[date] = { tokens: 0, feedback: 0, sessions: 0 };
      }
      dailyData[date].tokens += entry.tokens ?? 0;
    });

    // Process feedback
    (feedback ?? []).forEach((entry) => {
      const date = new Date(entry.created_at).toISOString().split("T")[0];
      if (!dailyData[date]) {
        dailyData[date] = { tokens: 0, feedback: 0, sessions: 0 };
      }
      dailyData[date].feedback += 1;
    });

    // Process system logs (estimate sessions - count unique hours as proxy)
    const sessionHours = new Set<string>();
    (systemLogs ?? []).forEach((entry) => {
      const date = new Date(entry.created_at);
      const hourKey = `${date.toISOString().split("T")[0]}-${date.getHours()}`;
      sessionHours.add(hourKey);
    });

    // Convert to chart format
    const chartData = Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        tokens: data.tokens,
        feedback: data.feedback,
        sessions: Math.ceil(sessionHours.size / 30), // Rough estimate
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate summary values
    const totalTokens = (tokenUsage ?? []).reduce((sum, entry) => sum + (entry.tokens ?? 0), 0);
    const totalFeedback = feedback?.length ?? 0;
    const estimatedSessions = sessionHours.size;

    return NextResponse.json({
      success: true,
      data: {
        chart: chartData,
        summary: {
          total_tokens: totalTokens,
          total_feedback: totalFeedback,
          estimated_sessions: estimatedSessions,
        },
      },
    });
  } catch (error) {
    console.error("[api/admin/engagement] Error", error);
    return NextResponse.json(
      { success: false, error: "Failed to load engagement data." },
      { status: 500 },
    );
  }
}

