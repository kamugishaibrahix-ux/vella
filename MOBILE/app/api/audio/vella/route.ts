import { NextRequest, NextResponse } from "next/server";

import { getUserPlanTier } from "@/lib/tiers/server";
import type { VellaAudioMode, VellaAudioRequest } from "@/lib/audio/vellaAudioTypes";
import { getPresetById } from "@/lib/audio/vellaAudioCatalog";
import { AUDIO_PLAN_UPSELL_MESSAGE, AUDIO_ELITE_ONLY_MESSAGE } from "@/lib/audio/messages";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
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

export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    const { limit, window } = RATE_LIMIT_CONFIG.routes["audio/vella"];
    await rateLimit({ key: `audio_vella:${userId}`, limit, window });

    const planTier = await getUserPlanTier(userId).catch(() => "free" as const);
    const body = (await req.json().catch(() => null)) as VellaAudioRequest | null;

    if (!body) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const estimatedTokens = 3500;
    const tokenCheck = await checkTokenAvailability(userId, planTier, estimatedTokens, "audio_vella", "audio");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }

    if (planTier === "free") {
      return NextResponse.json(
        { status: "blocked", reason: "plan", message: AUDIO_PLAN_UPSELL_MESSAGE },
        { status: 403 },
      );
    }

    const preset = body.presetId ? getPresetById(body.presetId) : undefined;
    const mode = normalizeMode(body.mode ?? preset?.mode, preset?.engineMode as VellaAudioMode | undefined);

    // Elite-only gating for music and singing modes
    if ((mode === "music" || mode === "singing") && planTier !== "elite") {
      return NextResponse.json(
        {
          status: "blocked",
          reason: "plan",
          message: AUDIO_ELITE_ONLY_MESSAGE,
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

    const audioBuffer = await requestOpenAiAudio(prompt, profile.voiceId, profile.format ?? "mp3");
    const audioBase64 = audioBuffer.toString("base64");

    await chargeTokensForOperation(
      userId,
      planTier,
      estimatedTokens,
      "audio_generation",
      "audio_vella",
      "audio",
    );

    return NextResponse.json({
      audioBase64,
      descriptor: {
        id: preset?.id ?? body.presetId,
        mode,
        title: preset?.label ?? "Vella audio",
        description: preset?.description ?? body.intent ?? "Custom audio from Vella.",
      },
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimit429Response(error.retryAfterSeconds);
    }
    safeErrorLog("[audio] vella route error", error);
    return serverErrorResponse("Audio generation failed. Please try again.");
  }
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
    throw new Error("Missing OPENAI_API_KEY");
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
