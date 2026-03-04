import { NextRequest, NextResponse } from "next/server";
import { resolveTTSVoice, normalizeVellaVoiceId } from "@/lib/voice/vellaVoices";
import { fetchWithTimeout } from "@/lib/security/fetchWithTimeout";
import { isAIDisabled } from "@/lib/security/killSwitch";

export const runtime = "nodejs";

const OPENAI_TTS_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_TIMEOUT_MS = 15_000;
const PREVIEW_TEXT = "Hi, I'm here to listen and support you. How are you feeling today?";

/**
 * Voice Preview — returns OpenAI TTS audio for a fixed sentence.
 *
 * POST { voiceId: "luna" | "aira" | "sol" | "orion", text?: string }
 * Returns { audioBase64, resolvedVoice, format }
 *
 * No auth/token gate — preview is free (rate limited by caller).
 * Uses the exact same TTS path as /api/voice/standard so preview matches reality.
 */
export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(
      { error: "ai_unavailable", message: "AI is temporarily disabled" },
      { status: 503 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "configuration_error", message: "TTS not configured" },
      { status: 503 },
    );
  }

  let body: { voiceId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Invalid JSON" },
      { status: 400 },
    );
  }

  const rawVoiceId = body.voiceId ?? "luna";
  const normalizedVoiceId = normalizeVellaVoiceId(rawVoiceId);
  const resolvedVoice = resolveTTSVoice(rawVoiceId);
  const text = (body.text ?? PREVIEW_TEXT).slice(0, 200);

  console.log("[VoicePreview] request", { rawVoiceId, normalizedVoiceId, resolvedVoice });

  try {
    const ttsResponse = await fetchWithTimeout(OPENAI_TTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: resolvedVoice,
        input: text,
        format: "mp3",
      }),
      timeoutMs: OPENAI_TTS_TIMEOUT_MS,
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text().catch(() => "unknown");
      console.error("[VoicePreview] tts_error", { status: ttsResponse.status, errorText });
      return NextResponse.json(
        { error: "VOICE_INVALID", message: "TTS rejected voice", detail: errorText },
        { status: 400 },
      );
    }

    const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    const audioBase64 = audioBuffer.toString("base64");

    return NextResponse.json({
      audioBase64,
      format: "mp3",
      resolvedVoice,
      voiceId: normalizedVoiceId,
    });
  } catch (err) {
    console.error("[VoicePreview] error", err);
    return NextResponse.json(
      { error: "TTS_ERROR", message: "Voice preview failed" },
      { status: 500 },
    );
  }
}
