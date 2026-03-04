/**
 * Phase 6C: Debug retrieval — top-K memory search. Authed user.
 * Free plan: excerpt redacted (empty string). Paid: include excerpt.
 * 
 * PHASE B - Refactored: Uses entitlements instead of tier string checks.
 * Now checks enableDeepMemory capability for excerpt access.
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { retrieveTopK } from "@/lib/memory/retrieve";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { safeErrorLog } from "@/lib/security/logGuard";

const READ_LIMIT = { limit: 30, window: 60 };
const ROUTE_KEY = "memory_search";

export async function GET(req: NextRequest) {
  // Step 1: Require entitlement (includes auth check)
  const entitlement = await requireEntitlement("chat_text");
  if (isEntitlementBlocked(entitlement)) return entitlement;
  const { userId, entitlements } = entitlement;

  const rateLimitResult = await rateLimit({
    key: `memory_search:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const k = Math.min(parseInt(url.searchParams.get("k") ?? "5", 10) || 5, 20);

  try {
    const blocks = await retrieveTopK({ userId, queryText: q, k, maxCharsTotal: 1500 });
    
    // PURE abstraction: Check capability instead of tier string
    // Deep memory users (typically Elite) get full excerpts
    const hasDeepMemory = entitlements.enableDeepMemory;

    const results = blocks.map((b) => ({
      sourceType: b.sourceType,
      sourceId: b.sourceId,
      excerpt: hasDeepMemory ? b.excerpt : "",
      excerptLength: b.excerpt.length,
      score: b.score,
      createdAtISO: b.createdAtISO,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    safeErrorLog("[api/memory/search] error", err);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
