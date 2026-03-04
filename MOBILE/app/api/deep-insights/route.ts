import { NextRequest, NextResponse } from "next/server";
import { generateDeepInsights } from "@/lib/insights/deepInsights";
import { saveDeepInsights } from "@/lib/insights/saveDeepInsights";
import { loadLatestDeepInsights } from "@/lib/insights/loadDeepInsights";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "deep_insights";

export async function GET() {
  // PURE abstraction: Use requireEntitlement, NOT tier strings
  const entitlement = await requireEntitlement("deep_insights");
  if (isEntitlementBlocked(entitlement)) {
    return entitlement;
  }
  const { userId } = entitlement;

  const rateLimitResult = await rateLimit({
    key: `read:deep_insights:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const bundle = await loadLatestDeepInsights(userId).catch(() => null);
    return NextResponse.json({ bundle });
  } catch (error) {
    safeErrorLog("[api/deep-insights] GET error", error);
    return NextResponse.json({ bundle: null }, { status: 200 });
  }
}

export async function POST(_req: NextRequest) {
  // PURE abstraction: Use requireEntitlement, NOT tier strings
  const entitlement = await requireEntitlement("deep_insights");
  if (isEntitlementBlocked(entitlement)) {
    return entitlement;
  }
  const { userId } = entitlement;

  const rateLimitResult = await rateLimit({
    key: `read:deep_insights:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
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

