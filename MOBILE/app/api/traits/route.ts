import { NextRequest, NextResponse } from "next/server";
import { getUserTraits, upsertUserTraits } from "@/lib/traits/adaptiveTraits";
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
    await rateLimit({ key: `read:traits:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
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

  try {
    await rateLimit({ key: `read:traits:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
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

