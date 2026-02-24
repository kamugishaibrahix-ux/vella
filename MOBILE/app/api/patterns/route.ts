import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateEmotionalPatterns } from "@/lib/insights/patterns";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";
import { serverErrorResponse } from "@/lib/security/consistentErrors";

const bodySchema = z.object({}).strict();

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:patterns:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    const personaSettings = await loadServerPersonaSettings(userId).catch(() => null);
    const language = personaSettings?.language ?? "en";
    const result = await generateEmotionalPatterns(
      userId,
      language,
      personaSettings ?? undefined,
    ).catch(() => ({ patterns: { commonPrimaryEmotions: [], commonTriggers: [], commonFears: [], emotionalTendencies: [] }, planTier: "free" as const }));

    return NextResponse.json({ patterns: result.patterns, planTier: result.planTier });
  } catch (error) {
    safeErrorLog("[api/patterns] error", error);
    return serverErrorResponse();
  }
}

