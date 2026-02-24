import { NextRequest, NextResponse } from "next/server";
import { loadConnectionDepth } from "@/lib/connection/loadConnectionDepth";
import { updateConnectionDepth } from "@/lib/connection/depthEngine";
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
    await rateLimit({ key: `read:connection_depth:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
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
    const depth = typeof state?.state?.connection_depth === "number"
      ? state.state.connection_depth
      : await loadConnectionDepth(userId).catch(() => 0);
    return NextResponse.json({ depth });
  } catch (error) {
    safeErrorLog("[api/connection-depth] GET error", error);
    return NextResponse.json({ depth: 0 }, { status: 200 });
  }
}

export async function POST(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:connection_depth:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const depth = await updateConnectionDepth(userId).catch(() => 0);
    return NextResponse.json({ depth });
  } catch (error) {
    safeErrorLog("[api/connection-depth] POST error", error);
    return NextResponse.json({ depth: 0 }, { status: 200 });
  }
}

