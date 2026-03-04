import { NextRequest, NextResponse } from "next/server";
import { buildGrowthRoadmapDetailed } from "@/lib/insights/growthRoadmap";
import { resolveServerLocale } from "@/i18n/serverLocale";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { growthRoadmapRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import { assertNoPII, PIIFirewallError, piiBlockedJsonResponse } from "@/lib/security/piiFirewall";

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

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal text IN MEMORY ONLY via AI agent.
 * - Generates growth roadmap (buildGrowthRoadmapDetailed)
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

  // Step 1: Entitlement check (growth_roadmap requires enableGrowthRoadmap)
  const entitlementResult = await requireEntitlement("growth_roadmap");
  if (isEntitlementBlocked(entitlementResult)) {
    return entitlementResult;
  }
  const { userId, plan } = entitlementResult;

  // Step 2: Rate limit (must be before token operations)
  const rateLimitResult = await rateLimit({
    key: `growth_roadmap:${userId}`,
    limit: RATE_LIMIT_MAX,
    window: RATE_LIMIT_WINDOW_SEC,
    routeKey: "growth_roadmap",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 3: Request validation
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

  // Step 4: Estimate tokens and check availability (early 402)
  const estimatedTokens = estimateTokensForRoadmap(persona);
  const tokenCheck = await checkTokenAvailability(userId, plan, estimatedTokens, "growth_roadmap", "text");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse();
  }

  // Step 5: ABORT-SAFE MONETISED OPERATION
  // The wrapper guarantees refund if client aborts or any error occurs
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens,
      operation: "growth_roadmap",
      route: "growth_roadmap",
      channel: "text",
      featureKey: "growth_roadmap",
      request: req,
    },
    async () => {
      // OpenAI call (may throw or be aborted)
      const engineResult = await buildGrowthRoadmapDetailed(userId, {
        persona: typeof persona === "object" && persona !== null ? persona : null,
        locale,
      });

      const { roadmap, fallback, error: roadmapError } = engineResult;

      // Check for fallback/error response
      if (fallback) {
        throw new Error(roadmapError ?? "roadmap_generation_failed");
      }

      // Phase Seal: Verify no personal text in metadata (PII firewall)
      try {
        assertNoPII({ userId, tokens: estimatedTokens, feature: "growth_roadmap" }, "token_usage");
      } catch (piiError) {
        if (piiError instanceof PIIFirewallError) {
          throw new Error("pii_firewall_violation");
        }
        throw piiError;
      }

      return { roadmap, fallback, error: null };
    }
  );

  // Handle operation result
  if (!result.success) {
    // Determine appropriate error response
    const errorMsg = result.error?.toLowerCase() || "";

    if (errorMsg.includes("pii_firewall")) {
      return NextResponse.json(piiBlockedJsonResponse(), { status: 403 });
    }

    // Log error for monitoring (refund already handled by wrapper)
    safeErrorLog("[growth-roadmap] operation failed", new Error(result.error));
    return NextResponse.json(
      { shortTerm: [], midTerm: [], longTerm: [], fallback: true, error: "roadmap_generation_failed" },
      { status: 200 },
    );
  }

  // Success - return data
  return NextResponse.json(result.data);
}
