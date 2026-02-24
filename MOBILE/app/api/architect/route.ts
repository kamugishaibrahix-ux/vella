import { NextResponse } from "next/server";
import { z } from "zod";
import { runLifeArchitect } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

const bodySchema = z.object({}).strict();

const ESTIMATED_TOKENS = 1000;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 120;

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

export async function POST(request: Request) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `architect:${userId}`, limit: RATE_LIMIT_MAX, window: RATE_LIMIT_WINDOW_SEC });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    throw err;
  }

  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }

    const plan = await getUserPlanTier(userId).catch(() => "free" as const);
    const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "architect", "text");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }

    const result = await runLifeArchitect(userId).catch((err) => {
      if (isCircuitOpenError(err)) throw err;
      return { error: "architect_failed" as const };
    });

    if (result && typeof result === "object" && "error" in result) {
      return serverErrorResponse();
    }

    if (result) {
      await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "life_architect", "architect", "text");
    }
    return NextResponse.json(result);
  } catch (error) {
    if (isCircuitOpenError(error)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[api/architect] error", error);
    return serverErrorResponse();
  }
}

