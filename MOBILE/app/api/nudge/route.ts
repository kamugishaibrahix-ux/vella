import { NextRequest, NextResponse } from "next/server";
import { createAndStoreNudge } from "@/lib/nudges/nudgeEngine";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };

export async function POST(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:nudge:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const nudge = await createAndStoreNudge(userId).catch(() => null);
    return NextResponse.json({ nudge });
  } catch (error) {
    safeErrorLog("[api/nudge] error", error);
    return NextResponse.json({ nudge: null }, { status: 200 });
  }
}
