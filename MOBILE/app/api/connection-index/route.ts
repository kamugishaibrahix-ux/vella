import { NextResponse } from "next/server";
import { getConnectionDashboard } from "@/lib/connection/depthEngine";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { getBehaviouralStateForUser, tryRecomputeWithCooldown } from "@/lib/engine/behavioural/getState";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };

export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:connection_index:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    let state = await getBehaviouralStateForUser(userId);
    if (!state) {
      await tryRecomputeWithCooldown(userId);
      state = await getBehaviouralStateForUser(userId);
    }
    if (state?.state) {
      const depth = typeof state.state.connection_depth === "number" ? state.state.connection_depth : 0;
      const progress = state.state.progress && typeof state.state.progress === "object" ? state.state.progress as Record<string, unknown> : {};
      const connectionIndex = typeof (progress as { connectionIndex?: number })?.connectionIndex === "number"
        ? (progress as { connectionIndex: number }).connectionIndex
        : depth / 100;
      return NextResponse.json({
        dashboard: {
          score: depth,
          smoothedScore: Math.round(connectionIndex * 100),
          lastUpdated: state.lastComputedAt,
          history: [],
          streakDays: 0,
          longestStreak: 0,
          daysAbsent: null,
          milestones: [],
          patterns: [],
          insights: [],
          suggestions: [],
          shortEmotionalLine: "I'm here with you.",
        },
      });
    }
    await getAllCheckIns(userId).catch(() => []);
    const dashboard = await getConnectionDashboard(userId).catch(() => null);
    return NextResponse.json({ dashboard });
  } catch (error) {
    safeErrorLog("[api/connection-index] GET error", error);
    return NextResponse.json({ dashboard: null }, { status: 200 });
  }
}

