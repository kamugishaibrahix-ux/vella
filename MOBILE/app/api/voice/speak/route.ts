import { NextRequest, NextResponse } from "next/server";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { fetchWithTimeout } from "@/lib/security/fetchWithTimeout";
import { runWithOpenAICircuit, isCircuitOpenError, recordOpenAIFailure } from "@/lib/ai/circuitBreaker";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

export const runtime = "nodejs";

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

const OPENAI_AUDIO_TIMEOUT_MS = 30_000;

const MAX_TEXT_LENGTH = 500;
const REQUEST_LIMIT = 20;
const REQUEST_WINDOW_SECONDS = 600; // 10 minutes

export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({
      key: `voice_speak:${userId}`,
      limit: REQUEST_LIMIT,
      window: REQUEST_WINDOW_SECONDS,
    });

    const body = (await req.json().catch(() => null)) as
      | {
          text?: unknown;
          language?: unknown;
        }
      | null;

    const rawText = typeof body?.text === "string" ? body.text.trim() : "";
    const language = typeof body?.language === "string" ? body.language : "en";

    if (!rawText) {
      return NextResponse.json({ error: "empty_text" }, { status: 400 });
    }

    if (rawText.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: "text_too_long" }, { status: 400 });
    }

    const plan = await getUserPlanTier(userId).catch(() => "free" as const);
    const estimatedTokens = 5000; // 1 audio clip cost
    const check = await checkTokenAvailability(
      userId,
      plan,
      estimatedTokens,
      "voice_speak",
      "audio",
    );
    if (!check.allowed) {
      return quotaExceededResponse();
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("[speak] Missing OPENAI_API_KEY");
      return serverErrorResponse("Missing API key");
    }

    const openaiRes = await runWithOpenAICircuit(() =>
      fetchWithTimeout("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice: "alloy",
          input: rawText,
          language,
          format: "mp3",
        }),
        timeoutMs: OPENAI_AUDIO_TIMEOUT_MS,
      })
    );

    if (!openaiRes.ok) {
      recordOpenAIFailure();
      const errorText = await openaiRes.text();
      safeErrorLog("[speak] OpenAI Error", new Error(String(openaiRes.status)));
      return serverErrorResponse(errorText);
    }

    const buffer = Buffer.from(await openaiRes.arrayBuffer());

    // TOKEN CHARGE (SAFE-MODE — NO ENFORCEMENT)
    // plan already loaded above

    await chargeTokensForOperation(
      userId,
      plan,
      5000,
      "audio_clip_generation",
      "voice_speak",
      "audio",
    );

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[speak] Server error", err);
    return serverErrorResponse();
  }
}

