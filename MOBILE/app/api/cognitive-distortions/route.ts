import { NextRequest, NextResponse } from "next/server";
import { detectCognitiveDistortions } from "@/lib/insights/cognitiveDistortions";
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
    await rateLimit({ key: `read:cognitive_distortions:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    // Swallow any provided payload but ignore user-controlled identifiers.
    await req.json().catch(() => ({}));

    const distortions = await detectCognitiveDistortions(userId).catch(() => []);
    return NextResponse.json({ distortions });
  } catch (error) {
    safeErrorLog("[api/cognitive-distortions] error", error);
    return NextResponse.json({ distortions: [] }, { status: 200 });
  }
}

