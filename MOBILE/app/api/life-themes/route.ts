import { NextRequest, NextResponse } from "next/server";
import { extractLifeThemes } from "@/lib/insights/lifeThemes";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "life_themes";

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:life_themes:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    await req.json().catch(() => ({})); // discard client payload

    const themes = await extractLifeThemes(userId).catch(() => []);
    return NextResponse.json({ themes });
  } catch (error) {
    safeErrorLog("[api/life-themes] error", error);
    return NextResponse.json({ themes: [] }, { status: 200 });
  }
}

