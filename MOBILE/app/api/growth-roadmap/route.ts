import { NextRequest, NextResponse } from "next/server";
import { buildGrowthRoadmapDetailed } from "@/lib/insights/growthRoadmap";
import { resolveServerLocale } from "@/i18n/serverLocale";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { growthRoadmapRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Per-user rate limit: 2 requests per 5 minutes (same class as deepdive). */
const RATE_LIMIT_MAX = 2;
const RATE_LIMIT_WINDOW_SEC = 300;

/** Base token estimate for roadmap generation (no persona); add input size when persona present. */
const BASE_ESTIMATED_TOKENS = 2000;

function estimateTokensForRoadmap(persona: unknown): number {
  if (persona == null) return BASE_ESTIMATED_TOKENS;
  const inputSize =
    typeof persona === "string" ? persona.length : JSON.stringify(persona).length;
  return BASE_ESTIMATED_TOKENS + Math.ceil(inputSize / 4);
}

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({
      key: `growth_roadmap:${userId}`,
      limit: RATE_LIMIT_MAX,
      window: RATE_LIMIT_WINDOW_SEC,
    });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return validationErrorResponse("Invalid JSON body");
  }

  const parseResult = growthRoadmapRequestSchema.safeParse(json ?? {});
  if (!parseResult.success) {
    return validationErrorResponse(formatZodError(parseResult.error));
  }

  const { persona = null } = parseResult.data;
  const locale = resolveServerLocale();
  const plan = await getUserPlanTier(userId).catch(() => "free" as const);
  const estimatedTokens = estimateTokensForRoadmap(persona);

  const tokenCheck = await checkTokenAvailability(userId, plan, estimatedTokens, "growth_roadmap", "text");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse();
  }

  try {
    const result = await buildGrowthRoadmapDetailed(userId, {
      persona: typeof persona === "object" && persona !== null ? persona : null,
      locale,
    });

    const { roadmap, fallback, error: roadmapError } = result;

    if (!fallback) {
      await chargeTokensForOperation(userId, plan, estimatedTokens, "growth_roadmap", "growth_roadmap", "text");
    }

    return NextResponse.json({
      ...roadmap,
      fallback,
      error: fallback ? roadmapError ?? "roadmap_generation_failed" : null,
    });
  } catch (error) {
    safeErrorLog("[api/growth-roadmap] error", error);
    return NextResponse.json(
      { shortTerm: [], midTerm: [], longTerm: [], fallback: true, error: "roadmap_generation_failed" },
      { status: 200 },
    );
  }
}

