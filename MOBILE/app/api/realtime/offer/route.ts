import { NextResponse } from "next/server";
import { z } from "zod";
import { logVoiceTelemetry } from "@/lib/telemetry/voiceTelemetry";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { fetchWithTimeout } from "@/lib/security/fetchWithTimeout";
import { runWithOpenAICircuit, isCircuitOpenError, recordOpenAIFailure } from "@/lib/ai/circuitBreaker";
import { serviceUnavailableResponse, forbiddenResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { VELLA_REALTIME_VOICE_CONFIG, getVellaRealtimeVoiceConfig } from "@/lib/realtime/vellaRealtimeConfig";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { estimateTokens } from "@/lib/tokens/costSchedule";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

const OPENAI_REALTIME_TIMEOUT_MS = 25_000;

// Voice/model config MUST only come from VELLA_REALTIME_VOICE_CONFIG or getVellaRealtimeVoiceConfig().
// Do NOT override model/voice/modalities/output_audio_format/temperature/top_p at runtime.
const OFFER_LIMIT = 3;
const OFFER_WINDOW_SECONDS = 300; // 5 minutes

const offerBodySchema = z.object({ sdp: z.string().min(1).max(20000) }).strict();
const telemetrySource = "realtime_api";

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

/**
 * PHASE SEAL HARDENING (20260240):
 * This route handles realtime voice offer negotiation with OpenAI.
 * - Negotiates WebRTC connection for realtime voice
 * - SDP exchange with OpenAI realtime API
 * - Only token usage metadata is recorded
 *
 * ABORT-SAFE REFUND (20260301):
 * Uses withMonetisedOperation wrapper to guarantee refund on client abort.
 */
export async function POST(request: Request) {
  const traceId = `vrt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tsStart = Date.now();
  const stages: string[] = [];
  const debug = process.env.NEXT_PUBLIC_VELLA_DEBUG === "1";

  console.log(`[RealtimeTrace:${traceId}] request_received`, { ts: tsStart });
  stages.push("request_received");

  if (isAIDisabled()) {
    console.log(`[RealtimeTrace:${traceId}] ai_disabled`);
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  // Step 1+2: Require entitlement (includes active user check + enableRealtime gating)
  const entitlement = await requireEntitlement("realtime_offer");
  if (isEntitlementBlocked(entitlement)) {
    console.log(`[RealtimeTrace:${traceId}] entitlement_blocked`);
    stages.push("entitlement_blocked");
    return entitlement;
  }
  const { userId, plan } = entitlement;
  console.log(`[RealtimeTrace:${traceId}] auth_ok`, { userId: userId.slice(0, 8), plan });
  stages.push("auth_ok");

  // Step 2b: Explicit plan-tier hard gate (defense-in-depth, never allow free plan)
  if (plan !== "pro" && plan !== "elite") {
    console.log(`[RealtimeTrace:${traceId}] plan_hard_block`, { plan });
    stages.push("plan_hard_block");
    return NextResponse.json(
      { error: "FEATURE_NOT_AVAILABLE", message: "Realtime voice requires Pro or Elite plan." },
      { status: 403 },
    );
  }
  stages.push("plan_tier_ok");

  // Step 3: Rate limit (must be before token operations)
  const rateLimitResult = await rateLimit({
    key: `realtime_offer:${userId}`,
    limit: OFFER_LIMIT,
    window: OFFER_WINDOW_SECONDS,
    routeKey: "realtime_offer",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 4: Request validation
  const raw = await request.json().catch(() => null);
  const parsed = offerBodySchema.safeParse(raw);
  if (!parsed.success) {
    safeErrorLog("[RealtimeOffer] invalid offer payload", parsed.error);
    logVoiceTelemetry({
      source: telemetrySource,
      kind: "error",
      code: "invalid_offer_payload",
      message: "Incoming realtime offer payload was invalid.",
      context: { hasOffer: Boolean(raw && typeof raw === "object" && "sdp" in raw), type: typeof raw?.sdp },
    });
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }
  const sdp = parsed.data.sdp;
  stages.push("validation_ok");

  // Step 5: Estimate tokens and check availability (early 402)
  const estimatedTokens = estimateTokens("realtime_offer");
  const tokenCheck = await checkTokenAvailability(userId, plan, estimatedTokens, "realtime_offer", "realtime_voice");
  if (!tokenCheck.allowed) {
    console.log(`[RealtimeTrace:${traceId}] token_blocked`, { estimatedTokens });
    stages.push("token_blocked");
    return quotaExceededResponse();
  }
  stages.push("token_check_ok");

  // Check admin policy for realtime eligibility (optional, best-effort)
  // This must happen before charging to avoid unnecessary charges
  try {
    const { loadAdminUserPolicy } = await import("@/lib/admin/adminPolicy");
    const policy = await loadAdminUserPolicy(userId).catch(() => null);
    if (policy && (policy.isDisabled || !policy.realtimeEnabled || !policy.canStartSession)) {
      return forbiddenResponse("Realtime not available for this account.");
    }
  } catch {
    // Silent fail - continue without policy check
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logVoiceTelemetry({
      source: telemetrySource,
      kind: "error",
      code: "config_error",
      message: "API configuration error.",
    });
    return serverErrorResponse("configuration_error");
  }

  // Load admin-tuned realtime config
  const realtimeConfig = await getVellaRealtimeVoiceConfig().catch(() => VELLA_REALTIME_VOICE_CONFIG);
  const PRIMARY_MODEL = realtimeConfig.model;
  const FALLBACK_MODEL = realtimeConfig.model;

  const negotiate = (model: string) =>
    fetchWithTimeout(`https://api.openai.com/v1/realtime?model=${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/sdp",
      },
      body: sdp,
      timeoutMs: OPENAI_REALTIME_TIMEOUT_MS,
    });

  // Step 6: ABORT-SAFE MONETISED OPERATION
  // The wrapper guarantees refund if client aborts or any error occurs
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens,
      operation: "realtime_offer_negotiation",
      route: "realtime_offer",
      channel: "realtime_voice",
      featureKey: "realtime_offer",
      request: request,
    },
    async () => {
      let usedFallback = false;

      const executeNegotiation = async () => {
        try {
          let response = await negotiate(PRIMARY_MODEL);
          if (!response.ok) {
            logVoiceTelemetry({
              source: telemetrySource,
              kind: "warning",
              code: "offer_primary_failed",
              message: "Primary realtime negotiation failed, attempting fallback.",
              context: { status: response.status },
            });
            usedFallback = true;
            response = await negotiate(FALLBACK_MODEL);
          }
          return response;
        } catch (err: unknown) {
          logVoiceTelemetry({
            source: telemetrySource,
            kind: "warning",
            code: "offer_primary_exception",
            message: "Primary realtime negotiation threw, attempting fallback.",
            context: { error: err instanceof Error ? err.message : "unknown_error" },
          });
          usedFallback = true;
          return negotiate(FALLBACK_MODEL);
        }
      };

      const negotiationResp = await runWithOpenAICircuit(executeNegotiation);

      const answerSdp = await negotiationResp.text();

      if (!negotiationResp.ok) {
        recordOpenAIFailure();
        logVoiceTelemetry({
          source: telemetrySource,
          kind: "error",
          code: "openai_offer_failed",
          message: "OpenAI Realtime /v1/realtime SDP negotiation failed.",
          context: {
            status: negotiationResp.status,
            hasAnswer: Boolean(answerSdp?.trim()),
          },
        });
        throw new Error("negotiation_failed");
      }

      if (!answerSdp.trim()) {
        recordOpenAIFailure();
        logVoiceTelemetry({
          source: telemetrySource,
          kind: "error",
          code: "empty_answer_sdp",
          message: "Realtime offer/answer exchange returned an empty SDP.",
        });
        throw new Error("empty_sdp");
      }

      logVoiceTelemetry({
        source: telemetrySource,
        kind: "info",
        code: "offer_succeeded",
        message: "Realtime offer/answer exchange succeeded.",
        context: {
          usedFallback,
        },
      });

      return { sdp: answerSdp };
    }
  );

  // Handle operation result
  if (!result.success) {
    const errorMsg = result.error?.toLowerCase() || "";

    if (isCircuitOpenError(new Error(result.error))) {
      return serviceUnavailableResponse();
    }

    // Log error for monitoring (refund already handled by wrapper)
    safeErrorLog("[realtime/offer] operation failed", new Error(result.error));
    return serviceUnavailableResponse();
  }

  // Success - return data
  const elapsed = Date.now() - tsStart;
  stages.push("success");
  console.log(`[RealtimeTrace:${traceId}] offer_success`, { elapsed, stages });

  const payload: Record<string, unknown> = { ...result.data };
  if (debug) {
    payload.__debug = {
      trace_id: traceId,
      plan,
      voice_transport: "realtime",
      stage: "success",
      openai_attempted: true,
      reason_if_blocked: null,
      stt_ok: true,
      tts_ok: true,
      elapsed_ms: elapsed,
      stages,
    };
  }

  const res = NextResponse.json(payload);
  res.headers.set("x-vella-trace-id", traceId);
  return res;
}
