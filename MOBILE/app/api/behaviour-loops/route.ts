import { NextRequest, NextResponse } from "next/server";
import { detectBehaviourLoops } from "@/lib/insights/behaviourLoops";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:behaviour_loops:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    // Read payload to maintain compatibility, but ignore any userId provided.
    await req.json().catch(() => ({}));

    const loops = await detectBehaviourLoops(userId).catch(() => []);
    return NextResponse.json({ loops });
  } catch (error) {
    safeErrorLog("[api/behaviour-loops] error", error);
    return NextResponse.json({ loops: [] }, { status: 200 });
  }
}

