import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyReview } from "@/lib/review/weeklyReview";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { updateConnectionDepth } from "@/lib/connection/depthEngine";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "weekly_review";

export async function GET(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:weekly_review:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    await getAllCheckIns(userId).catch(() => []);
    const review = await generateWeeklyReview(userId).catch(() => null);
    await updateConnectionDepth(userId).catch(() => {});
    return NextResponse.json({ review });
  } catch (error) {
    safeErrorLog("[api/weekly-review] error", error);
    return NextResponse.json({ review: null }, { status: 200 });
  }
}

