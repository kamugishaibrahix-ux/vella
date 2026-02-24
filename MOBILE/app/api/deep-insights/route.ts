import { NextRequest, NextResponse } from "next/server";
import { getUserPlanTier } from "@/lib/tiers/server";
import { generateDeepInsights } from "@/lib/insights/deepInsights";
import { saveDeepInsights } from "@/lib/insights/saveDeepInsights";
import { loadLatestDeepInsights } from "@/lib/insights/loadDeepInsights";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };

export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:deep_insights:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const tier = await getUserPlanTier(userId).catch(() => "free" as const);
    if (tier !== "elite") {
      return NextResponse.json({ bundle: null }, { status: 200 });
    }
    const bundle = await loadLatestDeepInsights(userId).catch(() => null);
    return NextResponse.json({ bundle });
  } catch (error) {
    safeErrorLog("[api/deep-insights] GET error", error);
    return NextResponse.json({ bundle: null }, { status: 200 });
  }
}

export async function POST(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:deep_insights:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const tier = await getUserPlanTier(userId).catch(() => "free" as const);
    if (tier !== "elite") {
      return NextResponse.json({ bundle: null }, { status: 200 });
    }
    const bundle = await generateDeepInsights(userId).catch(() => null);
    if (bundle) {
      await saveDeepInsights(userId, bundle).catch(() => {});
    }
    return NextResponse.json({ bundle });
  } catch (error) {
    safeErrorLog("[api/deep-insights] POST error", error);
    return NextResponse.json({ bundle: null }, { status: 200 });
  }
}

