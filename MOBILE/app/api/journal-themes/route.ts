import { NextRequest, NextResponse } from "next/server";
import { analyseJournalEntries } from "@/lib/insights/journalAnalysis";
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
    await rateLimit({ key: `read:journal_themes:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    await req.json().catch(() => ({}));

    const themes = await analyseJournalEntries(userId).catch(() => []);
    return NextResponse.json({ themes });
  } catch (error) {
    safeErrorLog("[api/journal-themes] error", error);
    return NextResponse.json({ themes: [] }, { status: 200 });
  }
}

