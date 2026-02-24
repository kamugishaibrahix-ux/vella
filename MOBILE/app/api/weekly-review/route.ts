import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyReview } from "@/lib/review/weeklyReview";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { updateConnectionDepth } from "@/lib/connection/depthEngine";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };

export async function GET(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:weekly_review:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
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

