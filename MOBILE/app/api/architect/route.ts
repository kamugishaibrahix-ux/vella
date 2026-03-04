import { NextResponse } from "next/server";
import { z } from "zod";
import { runLifeArchitect } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { estimateTokens } from "@/lib/tokens/costSchedule";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

const bodySchema = z.object({}).strict();

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SEC = 120;

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal text IN MEMORY ONLY via AI agent.
 * - Runs life architect analysis (runLifeArchitect)
 * - Text is processed and results returned
 * - Text is NEVER stored in Supabase
 * - Only token usage metadata is recorded
 *
 * ABORT-SAFE REFUND (20260301):
 * Uses withMonetisedOperation wrapper to guarantee refund on client abort.
 */
export async function POST(request: Request) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  // Step 1+2: Require entitlement (includes active user check + enableArchitect gating)
  const entitlement = await requireEntitlement("architect");
  if (isEntitlementBlocked(entitlement)) return entitlement;
  const { userId, plan } = entitlement;

  // Step 3: Rate limit (must be before token operations)
  const rateLimitResult = await rateLimit({ key: `architect:${userId}`, limit: RATE_LIMIT_MAX, window: RATE_LIMIT_WINDOW_SEC, routeKey: "architect" });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 4: Request validation
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  // Step 5: Estimate tokens and check availability (early 402)
  const estimatedTokens = estimateTokens("architect");
  const tokenCheck = await checkTokenAvailability(userId, plan, estimatedTokens, "architect", "text");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse();
  }

  // Step 6: ABORT-SAFE MONETISED OPERATION
  // The wrapper guarantees refund if client aborts or any error occurs
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens,
      operation: "life_architect",
      route: "architect",
      channel: "text",
      featureKey: "architect",
      request: request,
    },
    async () => {
      // OpenAI call (may throw or be aborted)
      const engineResult = await runLifeArchitect(userId);

      // Check for error response
      if (!engineResult) {
        throw new Error("no_result");
      }

      if (typeof engineResult === "object" && "error" in engineResult) {
        throw new Error("architect_failed");
      }

      return engineResult;
    }
  );

  // Handle operation result
  if (!result.success) {
    // Determine appropriate error response
    const errorMsg = result.error?.toLowerCase() || "";

    if (errorMsg.includes("circuit") || errorMsg.includes("circuit_open")) {
      return serviceUnavailableResponse();
    }

    // Log error for monitoring (refund already handled by wrapper)
    safeErrorLog("[architect] operation failed", new Error(result.error));
    return serverErrorResponse();
  }

  // Success - return data
  return NextResponse.json(result.data);
}
