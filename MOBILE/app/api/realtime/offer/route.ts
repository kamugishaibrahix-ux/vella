import { NextResponse } from "next/server";
import { z } from "zod";
import { logVoiceTelemetry } from "@/lib/telemetry/voiceTelemetry";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { fetchWithTimeout } from "@/lib/security/fetchWithTimeout";
import { runWithOpenAICircuit, isCircuitOpenError, recordOpenAIFailure } from "@/lib/ai/circuitBreaker";
import { serviceUnavailableResponse, forbiddenResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { VELLA_REALTIME_VOICE_CONFIG, getVellaRealtimeVoiceConfig } from "@/lib/realtime/vellaRealtimeConfig";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { requireUserId } from "@/lib/supabase/server-auth";
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

export async function POST(request: Request) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    const planTier = await getUserPlanTier(userId).catch(() => "free" as const);
    const estimatedTokens = 500; // Realtime offer negotiation
    const tokenCheck = await checkTokenAvailability(userId, planTier, estimatedTokens, "realtime_offer", "realtime_voice");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }
    
    // Check admin policy for realtime eligibility (optional, best-effort)
    try {
      const { loadAdminUserPolicy } = await import("@/lib/admin/adminPolicy");
      const policy = await loadAdminUserPolicy(userId).catch(() => null);
      if (policy && (policy.isDisabled || !policy.realtimeEnabled || !policy.canStartSession)) {
        console.warn("[RealtimeOffer] User blocked by admin policy", { userId, policy });
        return forbiddenResponse("Realtime not available for this account.");
      }
    } catch {
      // Silent fail - continue without policy check
    }
    
    await rateLimit({
      key: `realtime_offer:${userId}`,
      limit: OFFER_LIMIT,
      window: OFFER_WINDOW_SECONDS,
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[RealtimeOffer] missing OPENAI_API_KEY");
      logVoiceTelemetry({
        source: telemetrySource,
        kind: "error",
        code: "missing_api_key",
        message: "OPENAI_API_KEY is missing for realtime offer route.",
      });
      return serverErrorResponse("Missing API key");
    }

    // Load admin-tuned realtime config
    const realtimeConfig = await getVellaRealtimeVoiceConfig().catch(() => VELLA_REALTIME_VOICE_CONFIG);
    const PRIMARY_MODEL = realtimeConfig.model;
    const FALLBACK_MODEL = realtimeConfig.model;

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

    let usedFallback = false;

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

    let negotiationResp: Response;
    try {
      negotiationResp = await runWithOpenAICircuit(executeNegotiation);
    } catch (err: unknown) {
      logVoiceTelemetry({
        source: telemetrySource,
        kind: "error",
        code: "offer_negotiation_failed",
        message: "Realtime negotiation failed before receiving a response.",
        context: { error: err instanceof Error ? err.message : "unknown_error" },
      });
      return serviceUnavailableResponse();
    }

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
      return serviceUnavailableResponse();
    }

    if (!answerSdp.trim()) {
      recordOpenAIFailure();
      console.error("[RealtimeOffer] empty SDP answer");
      logVoiceTelemetry({
        source: telemetrySource,
        kind: "error",
        code: "empty_answer_sdp",
        message: "Realtime offer/answer exchange returned an empty SDP.",
      });
      return serviceUnavailableResponse();
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

    await chargeTokensForOperation(
      userId,
      planTier,
      estimatedTokens,
      "realtime_offer_negotiation",
      "realtime_offer",
      "realtime_voice",
    );

    return NextResponse.json({ sdp: answerSdp });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[RealtimeOffer] unexpected error", err);
    return serverErrorResponse(err instanceof Error ? err.message : undefined);
  }
}
