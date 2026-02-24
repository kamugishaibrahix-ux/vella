import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callVellaReflectionAPI, type ReflectionPayload } from "@/lib/ai/reflection";
import { updateLastActive } from "@/lib/memory/lastActive";
import { resolveServerLocale, normalizeLocale } from "@/i18n/serverLocale";
import type { UILanguageCode } from "@/i18n/types";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { RATE_LIMIT_CONFIG } from "@/lib/security/rateLimit/config";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { resolvePlanTier } from "@/lib/tiers/planUtils";
import { requireUserId } from "@/lib/supabase/server-auth";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";

const reflectionBodySchema = z
  .object({
    type: z.string().max(32).optional(),
    planTier: z.string().max(32).optional(),
    locale: z.string().max(32).optional(),
    mood: z.number().optional(),
    note: z.string().max(10000).optional(),
    energy: z.number().optional(),
    stress: z.number().optional(),
    focus: z.number().optional(),
    title: z.string().max(500).optional(),
    content: z.string().max(50000).optional(),
    mode: z.string().max(32).optional(),
    emotionalPatternsSummary: z.string().max(5000).optional(),
    insight: z.unknown().optional(),
    entries: z.unknown().optional(),
    checkins: z.unknown().optional(),
    patterns: z.unknown().optional(),
    journalThemes: z.unknown().optional(),
    data: z.unknown().optional(),
    persona: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    const { limit, window } = RATE_LIMIT_CONFIG.routes.reflection;
    await rateLimit({ key: `reflection:${userId}`, limit, window });

    const parsed = reflectionBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const payload = parsed.data;
    const rawLocale = payload.locale ?? resolveServerLocale();
    const locale = normalizeLocale(rawLocale) as UILanguageCode;
    console.log("🌐 API /reflection - Detected locale:", locale, "(raw:", rawLocale, ")");
    
    // Extract planTier from payload or default to "free"
    const planTier = resolvePlanTier(payload.planTier ?? null);
    
    const estimatedTokens = 4000;
    const tokenCheck = await checkTokenAvailability(userId, planTier, estimatedTokens, "reflection", "text");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }
    
    const type = (payload.type ?? "insight") as ReflectionPayload["type"];
    const result = await callVellaReflectionAPI({ ...payload, type, userId, locale, planTier } as ReflectionPayload).catch(() => ({
      type: "error" as const,
      message: "I couldn't process that reflection just now. Please try again shortly.",
    }));
    
    if (result.type === "ai_response") {
      await chargeTokensForOperation(userId, planTier, estimatedTokens, "reflection", "reflection", "text");
    }
    
    await updateLastActive().catch(() => {});
    return NextResponse.json(result);
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimit429Response(error.retryAfterSeconds);
    }
    safeErrorLog("[api] reflection route error", error);
    return serverErrorResponse();
  }
}

