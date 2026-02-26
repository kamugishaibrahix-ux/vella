/**
 * GET /api/commitments/list
 * Returns active + paused commitments for the authenticated user.
 * Metadata-only response.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { listCommitments } from "@/lib/execution/commitmentStore";

const RATE = { limit: 60, window: 60 };

export async function GET(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `user:commitments:list:${userId}`, limit: RATE.limit, window: RATE.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  const result = await listCommitments(userId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ commitments: result.commitments });
}
