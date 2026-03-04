import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callVellaReflectionAPI, type ReflectionPayload } from "@/lib/ai/reflection";
import { updateLastActive } from "@/lib/memory/lastActive";
import { resolveServerLocale, normalizeLocale } from "@/i18n/serverLocale";
import type { UILanguageCode } from "@/i18n/types";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { RATE_LIMIT_CONFIG } from "@/lib/security/rateLimit/config";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { estimateTokens } from "@/lib/tokens/costSchedule";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";
import { assertNoPII, PIIFirewallError, piiBlockedJsonResponse } from "@/lib/security/piiFirewall";

const reflectionBodySchema = z
  .object({
    type: z.string().max(32).optional(),
    planTier: z.string().max(32).optional(),
    locale: z.string().max(32).optional(),
    mood: z.number().optional(),
    note: z.string().max(10000).optional(),
    energy: z.number().optional(),
    stress: z.number().optional(),
    focus: z.number().optional(),
    title: z.string().max(500).optional(),
    content: z.string().max(50000).optional(),
    mode: z.string().max(32).optional(),
    emotionalPatternsSummary: z.string().max(5000).optional(),
    insight: z.unknown().optional(),
    entries: z.unknown().optional(),
    checkins: z.unknown().optional(),
    patterns: z.unknown().optional(),
    journalThemes: z.unknown().optional(),
    data: z.unknown().optional(),
    persona: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal text IN MEMORY ONLY.
 * - Accepts reflection content (note, content, title, emotionalPatternsSummary)
 * - Processes via callVellaReflectionAPI (AI analysis)
 * - Text is NEVER stored in Supabase
 * - Only token usage metadata is recorded
 * - All personal text is cleared after processing
 *
 * ABORT-SAFE REFUND (20260301):
 * Uses withMonetisedOperation wrapper to guarantee refund on client abort.
 */
export async function POST(req: NextRequest) {
  // Step 1+2: Require entitlement (includes active user check; reflection is always allowed)
  const entitlement = await requireEntitlement("reflection");
  if (isEntitlementBlocked(entitlement)) return entitlement;
  const { userId, plan } = entitlement;

  // Step 3: Rate limit (must be before token operations)
  const { limit, window } = RATE_LIMIT_CONFIG.routes.reflection;
  const rateLimitResult = await rateLimit({ key: `reflection:${userId}`, limit, window, routeKey: "reflection" });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 4: Request validation
  const parsed = reflectionBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const payload = parsed.data;
  const rawLocale = payload.locale ?? resolveServerLocale();
  const locale = normalizeLocale(rawLocale) as UILanguageCode;

  // Step 5: Estimate tokens and check availability (early 402)
  const estimatedTokens = estimateTokens("reflection");
  const tokenCheck = await checkTokenAvailability(userId, plan, estimatedTokens, "reflection", "text");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse();
  }

  const type = (payload.type ?? "insight") as ReflectionPayload["type"];

  // Step 6: ABORT-SAFE MONETISED OPERATION
  // The wrapper guarantees refund if client aborts or any error occurs
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens,
      operation: "reflection",
      route: "reflection",
      channel: "text",
      featureKey: "reflection",
      request: req,
    },
    async () => {
      // OpenAI call (may throw or be aborted)
      const apiResult = await callVellaReflectionAPI({ ...payload, type, userId, locale, planTier: plan } as ReflectionPayload);

      // Check for error response
      if (apiResult.type === "error") {
        throw new Error("reflection_failed");
      }

      if (apiResult.type !== "ai_response") {
        throw new Error("unexpected_result_type");
      }

      // Phase Seal: Verify no personal text in metadata (PII firewall)
      try {
        assertNoPII({ userId, tokens: estimatedTokens, feature: "reflection" }, "token_usage");
      } catch (piiError) {
        if (piiError instanceof PIIFirewallError) {
          throw new Error("pii_firewall_violation");
        }
        throw piiError;
      }

      return apiResult;
    }
  );

  // Update last active (best effort)
  await updateLastActive().catch(() => {});

  // Handle operation result
  if (!result.success) {
    // Determine appropriate error response
    const errorMsg = result.error?.toLowerCase() || "";

    if (errorMsg.includes("pii_firewall")) {
      return NextResponse.json(piiBlockedJsonResponse(), { status: 403 });
    }

    // Log error for monitoring (refund already handled by wrapper)
    safeErrorLog("[reflection] operation failed", new Error(result.error));
    return serverErrorResponse();
  }

  // Success - return data
  return NextResponse.json(result.data);
}
