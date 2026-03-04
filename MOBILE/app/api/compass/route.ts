import { NextRequest, NextResponse } from "next/server";
import { runCompassMode } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import { assertNoPII, PIIFirewallError, piiBlockedJsonResponse } from "@/lib/security/piiFirewall";

const ESTIMATED_TOKENS = 500;

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal text IN MEMORY ONLY via AI agent.
 * - Accepts raw text for AI processing (runCompassMode)
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
  // Step 1+2: Require entitlement (includes active user check + enableCompass gating)
  const entitlement = await requireEntitlement("compass");
  if (isEntitlementBlocked(entitlement)) return entitlement;
  const { userId, plan } = entitlement;

  // Step 3: Rate limit (must be before token operations)
  const rateLimitResult = await rateLimit({ key: `compass:${userId}`, limit: 3, window: 120, routeKey: "compass" });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 4: Token availability pre-check (early 402)
  const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "compass", "text");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse();
  }

  // Step 5: Request validation
  const body = (await req.json().catch(() => null)) as { raw?: string } | null;
  const raw = typeof body?.raw === "string" ? body.raw.trim() : "";

  if (!raw || raw.length > 1000) {
    return NextResponse.json({ error: "invalid_text" }, { status: 400 });
  }

  // Step 6: ABORT-SAFE MONETISED OPERATION
  // The wrapper guarantees refund if client aborts or any error occurs
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens: ESTIMATED_TOKENS,
      operation: "compass",
      route: "compass",
      channel: "text",
      featureKey: "compass",
      request: req,
    },
    async () => {
      // OpenAI call (may throw or be aborted)
      const engineResult = await runCompassMode({ raw }).catch(() => ({ error: "compass_failed" as const }));

      // Check for error response
      if (engineResult && "error" in engineResult) {
        throw new Error("compass_failed");
      }

      if (!engineResult) {
        throw new Error("no_result");
      }

      // Phase Seal: Verify no personal text in metadata (PII firewall)
      try {
        assertNoPII({ userId, tokens: ESTIMATED_TOKENS, feature: "compass" }, "token_usage");
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
    safeErrorLog("[compass] operation failed", new Error(result.error));
    return serverErrorResponse();
  }

  // Success - return data
  return NextResponse.json(result.data);
}
