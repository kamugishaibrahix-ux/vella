import { NextRequest, NextResponse } from "next/server";
import { detectBehaviourLoops } from "@/lib/insights/behaviourLoops";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "behaviour_loops";

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:behaviour_loops:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
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

