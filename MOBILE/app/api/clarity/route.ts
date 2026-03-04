import { NextRequest, NextResponse } from "next/server";
import { runClarityEngine } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { clarityRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import { assertNoPII, PIIFirewallError, piiBlockedJsonResponse } from "@/lib/security/piiFirewall";

const ESTIMATED_TOKENS = 500;

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal text IN MEMORY ONLY via AI agent.
 * - Accepts freeText for AI processing (runClarityEngine)
 * - Text is processed and results returned
 * - Text is NEVER stored in Supabase
 * - Only token usage metadata is recorded
 *
 * ABORT-SAFE REFUND (20260301):
 * Uses withMonetisedOperation wrapper to guarantee refund on client abort.
 */
export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }

  // Step 1+2: Require entitlement (includes active user check + enableClarity gating)
  const entitlement = await requireEntitlement("clarity");
  if (isEntitlementBlocked(entitlement)) return entitlement;
  const { userId, plan } = entitlement;

  // Step 3: Rate limit (must be before token operations)
  const rateLimitResult = await rateLimit({ key: `clarity:${userId}`, limit: 3, window: 120, routeKey: "clarity" });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 4: Token availability pre-check (early 402)
  const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "clarity", "text");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse();
  }

  // Step 5: Request validation
  const json = await req.json().catch(() => null);
  const parseResult = clarityRequestSchema.safeParse(json);
  if (!parseResult.success) {
    return validationErrorResponse(formatZodError(parseResult.error));
  }

  const { freeText, frame } = parseResult.data;

  // Step 6: ABORT-SAFE MONETISED OPERATION
  // The wrapper guarantees refund if client aborts or any error occurs
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens: ESTIMATED_TOKENS,
      operation: "clarity",
      route: "clarity",
      channel: "text",
      featureKey: "clarity",
      request: req,
    },
    async () => {
      // OpenAI call (may throw or be aborted)
      const engineResult = await runClarityEngine({ freeText, frame });

      // Check for error response
      if (engineResult && "error" in engineResult) {
        throw new Error("clarity_failed");
      }

      if (!engineResult) {
        throw new Error("no_result");
      }

      // Phase Seal: Verify no personal text in metadata (PII firewall)
      try {
        assertNoPII({ userId, tokens: ESTIMATED_TOKENS, feature: "clarity" }, "token_usage");
      } catch (piiError) {
        if (piiError instanceof PIIFirewallError) {
          throw new Error("pii_firewall_violation");
        }
        throw piiError;
      }

      return engineResult;
    }
  );

  // Handle operation result
  if (!result.success) {
    // Determine appropriate error response
    const errorMsg = result.error?.toLowerCase() || "";

    if (errorMsg.includes("pii_firewall")) {
      return NextResponse.json(piiBlockedJsonResponse(), { status: 403 });
    }

    if (errorMsg.includes("circuit") || errorMsg.includes("circuit_open")) {
      return serviceUnavailableResponse();
    }

    // Log error for monitoring (refund already handled by wrapper)
    safeErrorLog("[clarity] operation failed", new Error(result.error));
    return serverErrorResponse();
  }

  // Success - return data
  return NextResponse.json(result.data);
}
