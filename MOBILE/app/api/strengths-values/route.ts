import { NextRequest, NextResponse } from "next/server";
import { extractStrengthsAndValues } from "@/lib/insights/identity";
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
    await rateLimit({ key: `read:strengths_values:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    await req.json().catch(() => ({}));

    const result = await extractStrengthsAndValues(userId).catch(() => ({ strengths: [], values: [] }));
    return NextResponse.json(result);
  } catch (error) {
    safeErrorLog("[api/strengths-values] error", error);
    return NextResponse.json({ strengths: [], values: [] }, { status: 200 });
  }
}

