import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runDeepDive } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

const bodySchema = z
  .object({
    section: z.string().max(256).optional(),
    text: z.string().max(20000).optional(),
  })
  .strict();

const RATE_LIMIT_WINDOW = 10 * 60;
const RATE_LIMIT_MAX = 2;
const ESTIMATED_TOKENS = 1200;

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
      key: `deepdive:${userId}`,
      limit: RATE_LIMIT_MAX,
      window: RATE_LIMIT_WINDOW,
    });

    const plan = await getUserPlanTier(userId).catch(() => "free" as const);
    const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "deepdive", "text");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
    }
    const body = parsed.data;
    const result = await runDeepDive({
      section: body.section ?? "",
      text: body.text ?? "",
    }).catch(() => ({ error: "deepdive_failed" as const }));
    if (result && "error" in result) {
      return serverErrorResponse();
    }
    if (result) {
      await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "deepdive", "deepdive", "text");
    }
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[deepdive] route error", err);
    return serverErrorResponse();
  }
}

