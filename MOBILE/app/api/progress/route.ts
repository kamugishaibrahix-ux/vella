import { NextRequest, NextResponse } from "next/server";
import { getProgress, updateProgress } from "@/lib/progress/calculateProgress";
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
    await rateLimit({ key: `read:progress:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
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
    const progress = state?.state?.progress && typeof state.state.progress === "object"
      ? (state.state.progress as Record<string, unknown>)
      : await getProgress(userId).catch(() => ({}));
    return NextResponse.json({ progress });
  } catch (error) {
    safeErrorLog("[api/progress] GET error", error);
    return NextResponse.json({ progress: {} }, { status: 200 });
  }
}

export async function POST(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:progress:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const progress = await updateProgress(userId).catch(() => ({}));
    await updateConnectionDepth(userId).catch(() => {});
    return NextResponse.json({ progress });
  } catch (error) {
    safeErrorLog("[api/progress] POST error", error);
    return NextResponse.json({ progress: {} }, { status: 200 });
  }
}

