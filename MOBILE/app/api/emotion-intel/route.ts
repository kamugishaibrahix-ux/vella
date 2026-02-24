import { NextRequest, NextResponse } from "next/server";
import { runEmotionIntelBundle } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

const ESTIMATED_TOKENS = 700;

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `emotion-intel:${userId}`, limit: 5, window: 180 });

    const plan = await getUserPlanTier(userId).catch(() => "free" as const);
    const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "emotion-intel", "text");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }

    const body = (await req.json().catch(() => null)) as { text?: string } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";

    if (!text || text.length > 1000) {
      return NextResponse.json({ error: "invalid_text" }, { status: 400 });
    }

    const result = await runEmotionIntelBundle({ text }).catch(() => ({ error: "emotion_intel_failed" as const }));
    if (result && "error" in result) {
      return serverErrorResponse();
    }
    if (result) {
      await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "emotion-intel", "emotion-intel", "text");
    }
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[emotion-intel] route error", err);
    return serverErrorResponse();
  }
}

