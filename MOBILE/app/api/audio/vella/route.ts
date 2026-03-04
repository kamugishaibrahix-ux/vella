import { NextRequest, NextResponse } from "next/server";

import type { VellaAudioMode, VellaAudioRequest } from "@/lib/audio/vellaAudioTypes";
import { getPresetById } from "@/lib/audio/vellaAudioCatalog";
import { AUDIO_PLAN_UPSELL_MESSAGE, AUDIO_ELITE_ONLY_MESSAGE } from "@/lib/audio/messages";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { estimateTokens } from "@/lib/tokens/costSchedule";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { RATE_LIMIT_CONFIG } from "@/lib/security/rateLimit/config";
import { fetchWithTimeout } from "@/lib/security/fetchWithTimeout";
import { runWithOpenAICircuit, recordOpenAIFailure } from "@/lib/ai/circuitBreaker";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";
import { isAIDisabled } from "@/lib/security/killSwitch";

export const runtime = "nodejs";

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

const OPENAI_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const OPENAI_AUDIO_TIMEOUT_MS = 30_000;

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes audio generation IN MEMORY ONLY via OpenAI.
 * - Generates audio via OpenAI TTS
 * - Audio is processed and returned as base64
 * - Audio is NEVER stored in Supabase
 * - Only token usage metadata is recorded
 *
 * ABORT-SAFE REFUND (20260301):
 * Uses withMonetisedOperation wrapper to guarantee refund on client abort.
 */
export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  // Step 1+2: Require entitlement (includes active user check + enableAudioVella gating)
  const entitlement = await requireEntitlement("audio_vella");
  if (isEntitlementBlocked(entitlement)) return entitlement;
  const { userId, plan } = entitlement;

  // Step 3: Rate limit (must be before token operations)
  const { limit, window } = RATE_LIMIT_CONFIG.routes["audio/vella"];
  const rateLimitResult = await rateLimit({
    key: `audio_vella:${userId}`,
    limit,
    window,
    routeKey: "audio_vella",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 4: Request validation
  const body = (await req.json().catch(() => null)) as VellaAudioRequest | null;

  if (!body) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Step 5: Estimate tokens and check availability (early 402)
  const estimatedTokens = estimateTokens("audio_vella");
  const tokenCheck = await checkTokenAvailability(userId, plan, estimatedTokens, "audio_vella", "audio");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse();
  }

  const preset = body.presetId ? getPresetById(body.presetId) : undefined;
  const mode = normalizeMode(body.mode ?? preset?.mode, preset?.engineMode as VellaAudioMode | undefined);

  // Music and singing modes require advanced audio capability
  // Check if user has access to advanced audio features via entitlement
  if ((mode === "music" || mode === "singing") && !entitlement.entitlements.enableAudioVella) {
    return NextResponse.json(
      {
        status: "blocked",
        reason: "feature_not_available",
        message: AUDIO_ELITE_ONLY_MESSAGE,
        feature: "audio_music_mode",
      },
      { status: 403 },
    );
  }

  const prompt = buildAudioPrompt({
    mode,
    presetLabel: preset?.label,
    presetDescription: preset?.description,
    intent: body.intent,
    emotionHint: body.emotionHint,
    toneHint: body.toneHint,
    timeOfDay: body.timeOfDay,
  });

  const profile = pickVoiceProfile({
    mode,
    emotionHint: body.emotionHint,
    toneHint: body.toneHint,
    timeOfDay: body.timeOfDay,
    connectionDepth: body.connectionDepth,
    intent: body.intent,
  });

  // Step 6: ABORT-SAFE MONETISED OPERATION
  // The wrapper guarantees refund if client aborts or any error occurs
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens,
      operation: "audio_generation",
      route: "audio_vella",
      channel: "audio",
      featureKey: "audio_vella",
      request: req,
    },
    async () => {
      // OpenAI call (may throw or be aborted)
      const audioBuffer = await requestOpenAiAudio(prompt, profile.voiceId, profile.format ?? "mp3");
      const audioBase64 = audioBuffer.toString("base64");

      return {
        audioBase64,
        descriptor: {
          id: preset?.id ?? body.presetId,
          mode,
          title: preset?.label ?? "Vella audio",
          description: preset?.description ?? body.intent ?? "Custom audio from Vella.",
        },
      };
    }
  );

  // Handle operation result
  if (!result.success) {
    // Log error for monitoring (refund already handled by wrapper)
    safeErrorLog("[audio/vella] operation failed", new Error(result.error));
    recordOpenAIFailure();
    return serverErrorResponse("Audio generation failed. Please try again.");
  }

  // Success - return data
  return NextResponse.json(result.data);
}

function buildAudioPrompt({
  mode,
  presetLabel,
  presetDescription,
  intent,
  emotionHint,
  toneHint,
  timeOfDay,
}: {
  mode: VellaAudioMode;
  presetLabel?: string;
  presetDescription?: string;
  intent?: string;
  emotionHint?: string | null;
  toneHint?: string | null;
  timeOfDay?: string | null;
}): string {
  const moodLine = emotionHint ? `Mood: ${emotionHint}.` : "";
  const toneLine = toneHint ? `Tone: ${toneHint}.` : "";
  const timeLine = timeOfDay ? `Time of day: ${timeOfDay}.` : "";
  const presetLine = presetDescription ?? intent ?? presetLabel ?? "";

  switch (mode) {
    case "singing":
      return `Sing a short, original, gentle melody with no lyrics referencing existing songs. Keep it warm and caring. ${presetLine} ${moodLine} ${toneLine} ${timeLine}`.trim();
    case "meditation":
      return `Create a soft meditation backdrop for breathing, minimal variation, no vocals. ${presetLine} ${moodLine} ${toneLine} ${timeLine}`.trim();
    case "emotion":
      return `Generate a textured emotional background that supports conversation. Avoid harsh percussion. ${presetLine} ${moodLine} ${toneLine} ${timeLine}`.trim();
    case "music":
      return `Compose an original instrumental bed with subtle motion and no recognizable melodies. ${presetLine} ${moodLine} ${toneLine} ${timeLine}`.trim();
    default:
      return `Produce a loopable ambient soundscape with organic textures and gentle evolution. ${presetLine} ${moodLine} ${toneLine} ${timeLine}`.trim();
  }
}

function pickVoiceProfile({
  mode,
  emotionHint,
  toneHint,
  timeOfDay,
  connectionDepth,
  intent,
}: {
  mode: VellaAudioMode;
  emotionHint?: string | null;
  toneHint?: string | null;
  timeOfDay?: string | null;
  connectionDepth?: number | null;
  intent?: string;
}): { voiceId: string; format?: "mp3" | "wav" } {
  const emotion = (emotionHint ?? intent ?? "").toLowerCase();
  const tone = (toneHint ?? "").toLowerCase();
  const depth = connectionDepth ?? 0;
  const night = (timeOfDay ?? "").toLowerCase().includes("night");

  if (mode === "singing") {
    if (emotion.includes("rap") || intent?.toLowerCase().includes("rap")) {
      return { voiceId: "lyric", format: "mp3" };
    }
    if (emotion.includes("sad") || emotion.includes("tired") || night) {
      return { voiceId: "solaria", format: "mp3" };
    }
    return { voiceId: "alloy", format: "mp3" };
  }

  if (mode === "meditation") {
    return { voiceId: "calypso", format: "mp3" };
  }

  if (mode === "emotion") {
    if (emotion.includes("sad") || tone.includes("warm") || depth >= 60) {
      return { voiceId: "solaria", format: "mp3" };
    }
    if (emotion.includes("happy") || emotion.includes("uplift")) {
      return { voiceId: "ember", format: "mp3" };
    }
    return { voiceId: "alloy", format: "mp3" };
  }

  if (mode === "music") {
    return { voiceId: "luna", format: "mp3" };
  }

  return { voiceId: "alloy", format: "mp3" };
}

async function requestOpenAiAudio(prompt: string, voiceId: string, format: "mp3" | "wav") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("configuration_error");
  }

  const response = await runWithOpenAICircuit(() =>
    fetchWithTimeout(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: voiceId,
        input: prompt,
        format,
      }),
      timeoutMs: OPENAI_AUDIO_TIMEOUT_MS,
    })
  );

  if (!response.ok) {
    recordOpenAIFailure();
    const errorText = await response.text().catch(() => "unknown_error");
    throw new Error(`OpenAI audio error: ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function normalizeMode(mode?: VellaAudioMode | null, fallback?: VellaAudioMode): VellaAudioMode {
  if (!mode) {
    return fallback ?? "meditation";
  }
  if (
    mode === "music" ||
    mode === "meditation" ||
    mode === "emotion" ||
    mode === "singing"
  ) {
    return mode;
  }
  const normalized = mode.toLowerCase();
  if (normalized.startsWith("hum") || normalized.includes("sing")) return "singing";
  if (normalized.startsWith("meditation")) return "meditation";
  if (normalized.startsWith("emotion")) return "emotion";
  return fallback ?? "meditation";
}
