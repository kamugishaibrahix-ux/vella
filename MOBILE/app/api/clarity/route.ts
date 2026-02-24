import { NextRequest, NextResponse } from "next/server";
import { runClarityEngine } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { clarityRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
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
    await rateLimit({ key: `clarity:${userId}`, limit: 3, window: 120 });

    const plan = await getUserPlanTier(userId).catch(() => "free" as const);
    const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "clarity", "text");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }

    const json = await req.json().catch(() => null);
    const parseResult = clarityRequestSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const { freeText, frame } = parseResult.data;

    const result = await runClarityEngine({
      freeText,
      frame,
    }).catch(() => ({ error: "clarity_failed" as const }));
    if (result && "error" in result) {
      return serverErrorResponse();
    }
    if (result) {
      await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "clarity", "clarity", "text");
    }
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[clarity] route error", err);
    return serverErrorResponse();
  }
}

