/**
 * Phase 6C: Debug retrieval — top-K memory search. Authed user.
 * Free plan: excerpt redacted (empty string). Paid: include excerpt.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { retrieveTopK } from "@/lib/memory/retrieve";
import { getUserPlanTier } from "@/lib/tiers/server";
import { safeErrorLog } from "@/lib/security/logGuard";

const READ_LIMIT = { limit: 30, window: 60 };

export async function GET(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `memory_search:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const k = Math.min(parseInt(url.searchParams.get("k") ?? "5", 10) || 5, 20);

  try {
    const blocks = await retrieveTopK({ userId, queryText: q, k, maxCharsTotal: 1500 });
    const planTier = await getUserPlanTier(userId).catch(() => "free" as const);
    const paid = planTier === "pro" || planTier === "elite";

    const results = blocks.map((b) => ({
      sourceType: b.sourceType,
      sourceId: b.sourceId,
      excerpt: paid ? b.excerpt : "",
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
