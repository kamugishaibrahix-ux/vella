import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/adminClient";
import { requireAdmin, getAdminUserId } from "@/lib/auth/requireAdmin";
import { rateLimitAdmin, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const SINCE_PRESETS = ["15m", "1h", "24h", "7d"] as const;
const sinceSchema = z.union([
  z.enum(SINCE_PRESETS),
  z.string().datetime({ message: "since must be ISO 8601 datetime" }),
  z.coerce.number().refine((n) => n > 0 && n <= Number.MAX_SAFE_INTEGER, "since must be positive numeric timestamp (ms)"),
]);
const MAX_SINCE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

type LogEntry = {
  id: string;
  type: string;
  message?: string;
  action?: string;
  previous?: unknown;
  next?: unknown;
  created_at: string;
  source: "system_logs" | "admin_activity_log";
};

export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const userId = await getAdminUserId();
    await rateLimitAdmin(request, "logs-list", userId);
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const { searchParams } = new URL(request.url);
    const sinceRaw = searchParams.get("since") ?? "15m";
    const parsed = sinceSchema.safeParse(sinceRaw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", details: "since must be 15m, 1h, 24h, 7d, an ISO date string, or a numeric timestamp (ms)." },
        { status: 400 },
      );
    }

    const now = new Date();
    const nowMs = now.getTime();
    let cutoffDate: Date = new Date();
    if (typeof parsed.data === "number") {
      cutoffDate = new Date(parsed.data);
    } else if ((SINCE_PRESETS as readonly string[]).includes(parsed.data)) {
      switch (parsed.data) {
        case "15m":
          cutoffDate = new Date(nowMs - 15 * 60 * 1000);
          break;
        case "1h":
          cutoffDate = new Date(nowMs - 60 * 60 * 1000);
          break;
        case "24h":
          cutoffDate = new Date(nowMs - 24 * 60 * 60 * 1000);
          break;
        case "7d":
          cutoffDate = new Date(nowMs - 7 * 24 * 60 * 60 * 1000);
          break;
      }
    } else {
      cutoffDate = new Date(parsed.data);
    }

    const cutoffMs = cutoffDate.getTime();
    if (cutoffMs > nowMs) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", details: "since cannot be in the future." },
        { status: 400 },
      );
    }
    if (nowMs - cutoffMs > MAX_SINCE_MS) {
      return NextResponse.json(
        { success: false, error: "VALIDATION_ERROR", details: "since must be within the last 90 days." },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const [systemLogsResponse, activityLogsResponse] = await Promise.all([
      supabase.from("system_logs").select("*").gte("created_at", cutoffDate.toISOString()),
      supabase.from("admin_activity_log").select("*").gte("created_at", cutoffDate.toISOString()),
    ]);

    if (systemLogsResponse.error) {
      throw systemLogsResponse.error;
    }

    if (activityLogsResponse.error) {
      throw activityLogsResponse.error;
    }

    const combined: LogEntry[] = [
      ...(systemLogsResponse.data ?? []).map((log) => ({
        ...log,
        source: "system_logs" as const,
      })),
      ...(activityLogsResponse.data ?? []).map((log) => ({
        ...log,
        source: "admin_activity_log" as const,
      })),
    ];

    combined.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return NextResponse.json({ success: true, data: combined });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "Failed to load logs." },
      { status: 500 },
    );
  }
}

