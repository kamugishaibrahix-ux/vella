/**
 * GET /api/focus/week — weekly focus suggestion for current ISO week.
 * Structured data only. No free text. Deterministic.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { getISOWeekId } from "@/lib/focus/weekId";
import { suggestWeeklyFocusItems } from "@/lib/focus/focusEngine";
import { buildFocusInputForUser } from "@/lib/focus/buildFocusInput";
import { getWeeklyFocusReview } from "@/lib/focus/review";

const MAX_ACTIVE_VALUES = 20;
const CODE_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Parses activeValues query param: missing → undefined, empty → [], otherwise deduplicated code-safe array. */
function parseActiveValuesFromQuery(req: NextRequest): string[] | undefined {
  const url = req.nextUrl ?? (req.url ? new URL(req.url) : null);
  const raw = url?.searchParams.get("activeValues");
  if (raw == null) return undefined;
  if (raw === "") return [];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length > MAX_ACTIVE_VALUES) return undefined;
  const valid = parts.filter((p) => p.length <= 50 && CODE_REGEX.test(p));
  const deduplicated = Array.from(new Set(valid));
  return deduplicated.length > 0 ? deduplicated : [];
}

export async function GET(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof NextResponse) return userIdOr401;
  const userId = userIdOr401;

  try {
    const weekId = getISOWeekId(new Date());
    const activeValues = parseActiveValuesFromQuery(req);
    const input = await buildFocusInputForUser(userId, activeValues);
    const items = suggestWeeklyFocusItems(input);
    const review = await getWeeklyFocusReview(userId, weekId);
    const weekSoFarPercent = review?.completionScore0to100 ?? 0;
    const checkinCount = review?.checkinCount ?? 0;
    const submittedToday = review?.submittedToday ?? false;
    return NextResponse.json({
      weekId,
      items,
      weekSoFarPercent,
      checkinCount,
      submittedToday,
    });
  } catch (err) {
    console.error("[api/focus/week] GET error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
