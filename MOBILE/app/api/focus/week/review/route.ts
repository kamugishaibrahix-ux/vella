/**
 * GET /api/focus/week/review?weekId=YYYY-Www — weekly review + suggested next week.
 * Structured response only. No free text.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { isValidWeekId } from "@/lib/focus/weekId";
import { getWeeklyFocusReview } from "@/lib/focus/review";

export async function GET(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof NextResponse) return userIdOr401;
  const userId = userIdOr401;

  const url = req.url ? new URL(req.url) : null;
  const weekId = url?.searchParams.get("weekId") ?? null;
  if (weekId == null || !isValidWeekId(weekId)) {
    return NextResponse.json({ error: "invalid_week_id" }, { status: 400 });
  }

  try {
    const review = await getWeeklyFocusReview(userId, weekId);
    if (review == null) {
      return NextResponse.json({ error: "invalid_week_id" }, { status: 400 });
    }
    return NextResponse.json(review);
  } catch (err) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
