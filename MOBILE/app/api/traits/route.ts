import { NextRequest, NextResponse } from "next/server";
import { getUserTraits, upsertUserTraits } from "@/lib/traits/adaptiveTraits";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { getBehaviouralStateForUser, tryRecomputeWithCooldown } from "@/lib/engine/behavioural/getState";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "traits";

export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:traits:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    let state = await getBehaviouralStateForUser(userId);
    if (!state) {
      await tryRecomputeWithCooldown(userId);
      state = await getBehaviouralStateForUser(userId);
    }
    const traits = state?.state?.traits && typeof state.state.traits === "object"
      ? (state.state.traits as Record<string, unknown>)
      : await getUserTraits(userId).catch(() => null);
    return NextResponse.json({ traits: traits ?? [] });
  } catch (error) {
    safeErrorLog("[api/traits] GET error", error);
    return NextResponse.json({ traits: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:traits:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  void req;
  try {
    const traits = await upsertUserTraits(userId).catch(() => []);
    return NextResponse.json({ traits });
  } catch (error) {
    safeErrorLog("[api/traits] POST error", error);
    return NextResponse.json({ traits: [] }, { status: 200 });
  }
}

