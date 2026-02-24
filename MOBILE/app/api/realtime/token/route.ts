import { NextRequest, NextResponse } from "next/server";
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

const LIMIT_PER_WINDOW = 2;
const LIMIT_WINDOW_SECONDS = 60;
const OPENAI_REALTIME_TIMEOUT_MS = 15_000;

const methodNotAllowed = () =>
  NextResponse.json({ error: "method_not_allowed" }, { status: 405 });

type SessionResponse = {
  client_secret?: {
    value?: string;
    expires_at?: string | number;
  };
  error?: unknown;
};

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

export async function GET(req: NextRequest) {
  if (req.method !== "GET") {
    return methodNotAllowed();
  }
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    const planTier = await getUserPlanTier(userId).catch(() => "free" as const);
    const estimatedTokens = 750; // Realtime session creation (500-1000 range)
    const tokenCheck = await checkTokenAvailability(userId, planTier, estimatedTokens, "realtime_token", "realtime_voice");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }
    
    // Check admin policy for realtime eligibility (optional, best-effort)
    try {
      const { loadAdminUserPolicy } = await import("@/lib/admin/adminPolicy");
      const policy = await loadAdminUserPolicy(userId).catch(() => null);
      if (policy && (policy.isDisabled || !policy.realtimeEnabled || !policy.canStartSession)) {
        console.warn("[RealtimeToken] User blocked by admin policy", { userId, policy });
        return forbiddenResponse("Realtime not available for this account.");
      }
    } catch {
      // Silent fail - continue without policy check
    }
    
    await rateLimit({
      key: `realtime_token:${userId}`,
      limit: LIMIT_PER_WINDOW,
      window: LIMIT_WINDOW_SECONDS,
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[RealtimeToken] missing OPENAI_API_KEY");
      return serverErrorResponse("Missing API key");
    }

    // Load admin-tuned realtime config
    const realtimeConfig = await getVellaRealtimeVoiceConfig().catch(() => VELLA_REALTIME_VOICE_CONFIG);
    const REALTIME_MODEL = realtimeConfig.model;

    const sessionResp = await runWithOpenAICircuit(() =>
      fetchWithTimeout("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: REALTIME_MODEL }),
        timeoutMs: OPENAI_REALTIME_TIMEOUT_MS,
      })
    );

    const json = (await sessionResp.json()) as SessionResponse;

    if (!sessionResp.ok) {
      recordOpenAIFailure();
      safeErrorLog("[RealtimeToken] OpenAI session error", new Error(String(sessionResp.status)));
      return serviceUnavailableResponse();
    }

    const token = json?.client_secret?.value ?? null;
    const expiresAt = json?.client_secret?.expires_at ?? null;

    if (!token) {
      if (process.env.NODE_ENV === "development") {
        console.error("[RealtimeToken] missing client_secret.value");
      }
      return serverErrorResponse("Missing client token");
    }

    await chargeTokensForOperation(
      userId,
      planTier,
      estimatedTokens,
      "realtime_session_creation",
      "realtime_token",
      "realtime_voice",
    );

    return NextResponse.json({ token, expiresAt });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[RealtimeToken] unexpected error", err);
    return serverErrorResponse(err instanceof Error ? err.message : undefined);
  }
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const HEAD = methodNotAllowed;
