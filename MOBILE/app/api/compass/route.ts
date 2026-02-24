import { NextRequest, NextResponse } from "next/server";
import { runCompassMode } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

const ESTIMATED_TOKENS = 500;

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `compass:${userId}`, limit: 3, window: 120 });

    const plan = await getUserPlanTier(userId).catch(() => "free" as const);
    const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "compass", "text");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }

    const body = (await req.json().catch(() => null)) as { raw?: string } | null;
    const raw = typeof body?.raw === "string" ? body.raw.trim() : "";

    if (!raw || raw.length > 1000) {
      return NextResponse.json({ error: "invalid_text" }, { status: 400 });
    }

    const result = await runCompassMode({ raw }).catch(() => ({ error: "compass_failed" as const }));
    if (result && "error" in result) {
      return serverErrorResponse();
    }
    if (result) {
      await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "compass", "compass", "text");
    }
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[compass] route error", err);
    return serverErrorResponse();
  }
}

