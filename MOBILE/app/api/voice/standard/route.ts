import { NextRequest, NextResponse } from "next/server";
import { openai, model } from "@/lib/ai/client";
import { runWithOpenAICircuit, isCircuitOpenError, recordOpenAIFailure } from "@/lib/ai/circuitBreaker";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { RATE_LIMIT_CONFIG } from "@/lib/security/rateLimit/config";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { estimateTokens } from "@/lib/tokens/costSchedule";
import { fetchWithTimeout } from "@/lib/security/fetchWithTimeout";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import { resolveTTSVoice } from "@/lib/voice/vellaVoices";

export const runtime = "nodejs";

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };
const OPENAI_TTS_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_TIMEOUT_MS = 30_000;

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB (Whisper limit)
const ALLOWED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/mpga",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
];

const VELLA_SYSTEM_PROMPT = `You are Vella, a warm and emotionally intelligent AI companion. You respond with empathy, clarity, and care. Keep responses concise (1-3 sentences) since they will be spoken aloud. Do not use markdown, bullet points, or formatting — respond in natural spoken language.`;

/**
 * Standard Voice Route — Turn-based HTTP voice interaction.
 *
 * Flow: Audio upload → STT (Whisper) → LLM (GPT) → TTS (OpenAI Speech) → Audio response
 *
 * Available to ALL plans (no entitlement gate, token-gated only).
 * Does NOT use WebRTC or /api/realtime/offer.
 *
 * ABORT-SAFE REFUND (20260303):
 * Uses withMonetisedOperation wrapper to guarantee refund on client abort.
 */
export async function POST(req: NextRequest) {
  const traceId = `vst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tsStart = Date.now();
  const stages: string[] = [];
  const debug = process.env.NEXT_PUBLIC_VELLA_DEBUG === "1";

  console.log(`[StandardVoiceTrace:${traceId}] request_received`, { ts: tsStart });
  stages.push("request_received");

  if (isAIDisabled()) {
    console.log(`[StandardVoiceTrace:${traceId}] ai_disabled`);
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }

  // Step 1: Entitlement check (voice_standard has no entitlement flag = available to all)
  const entitlement = await requireEntitlement("voice_standard");
  if (isEntitlementBlocked(entitlement)) {
    console.log(`[StandardVoiceTrace:${traceId}] entitlement_blocked`);
    stages.push("entitlement_blocked");
    return entitlement;
  }
  const { userId, plan } = entitlement;
  console.log(`[StandardVoiceTrace:${traceId}] auth_ok`, { userId: userId.slice(0, 8), plan });
  stages.push("auth_ok");

  // Step 2: Rate limit
  const { limit, window } = RATE_LIMIT_CONFIG.routes["voice/standard"];
  const rateLimitResult = await rateLimit({
    key: `voice_standard:${userId}`,
    limit,
    window,
    routeKey: "voice/standard",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }
  stages.push("rate_limit_ok");

  // Step 3: Token availability check (early 402)
  const estimatedTokenCost = estimateTokens("voice_standard");
  const tokenCheck = await checkTokenAvailability(userId, plan, estimatedTokenCost, "voice_standard", "audio");
  if (!tokenCheck.allowed) {
    console.log(`[StandardVoiceTrace:${traceId}] token_blocked`, { estimatedTokenCost });
    stages.push("token_blocked");
    return quotaExceededResponse();
  }
  stages.push("token_check_ok");

  // Step 4: Request validation — expect multipart/form-data with audio file
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Expected multipart/form-data with audio file." },
      { status: 400 },
    );
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Could not parse form data." },
      { status: 400 },
    );
  }

  const audioFile = formData.get("audio");
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Audio file missing or invalid." },
      { status: 400 },
    );
  }

  if (audioFile.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      { error: "PAYLOAD_TOO_LARGE", message: "Audio file exceeds maximum size." },
      { status: 413 },
    );
  }

  const mime = (audioFile.type || "").toLowerCase().split(";")[0]?.trim();
  if (!mime || !ALLOWED_MIME_TYPES.includes(mime)) {
    return NextResponse.json(
      { error: "INVALID_MEDIA_TYPE", message: "Unsupported audio format." },
      { status: 415 },
    );
  }

  // Conversation history (optional, for context)
  const historyRaw = formData.get("history");
  let conversationHistory: Array<{ role: string; content: string }> = [];
  if (historyRaw && typeof historyRaw === "string") {
    try {
      conversationHistory = JSON.parse(historyRaw);
    } catch {
      // Ignore malformed history
    }
  }

  // Voice preference (optional) — resolve product voice to valid OpenAI TTS voice
  const rawVoiceId = (formData.get("voiceId") as string) || "luna";
  const voiceId = resolveTTSVoice(rawVoiceId);
  console.log(`[StandardVoiceTrace:${traceId}] voice_resolved`, { rawVoiceId, resolvedVoice: voiceId });

  stages.push("validation_ok");

  const client = openai;
  if (!client) {
    return serviceUnavailableResponse();
  }

  // Prepare audio File object for Whisper
  const whisperFile = audioFile instanceof File
    ? audioFile
    : new File([audioFile as Blob], "recording.webm", { type: (audioFile as Blob).type || "audio/webm" });

  // Step 5: ABORT-SAFE MONETISED OPERATION
  // Entire STT → LLM → TTS pipeline runs inside the monetised wrapper
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens: estimatedTokenCost,
      operation: "voice_standard",
      route: "voice/standard",
      channel: "audio",
      featureKey: "voice_standard",
      request: req,
    },
    async () => {
      // ── STAGE 1: STT (Whisper) ──
      console.log(`[StandardVoiceTrace:${traceId}] stt_start`);
      const transcript = await runWithOpenAICircuit(() =>
        client.audio.transcriptions.create({
          file: whisperFile,
          model: "whisper-1",
        })
      );

      const userText = (transcript as { text?: string })?.text?.trim() ?? "";
      if (!userText) {
        throw new Error("empty_transcription");
      }
      console.log(`[StandardVoiceTrace:${traceId}] stt_ok`, { chars: userText.length });
      stages.push("stt_ok");

      // ── STAGE 2: LLM (Chat Completion) ──
      console.log(`[StandardVoiceTrace:${traceId}] llm_start`);
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: VELLA_SYSTEM_PROMPT },
      ];

      // Append conversation history for context (limit to last 10 turns)
      const recentHistory = conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Append current user utterance
      messages.push({ role: "user", content: userText });

      const completion = await runWithOpenAICircuit(() =>
        client.chat.completions.create({
          model,
          messages,
          max_tokens: 300,
          temperature: 0.7,
        })
      );

      const assistantText = completion.choices?.[0]?.message?.content?.trim() ?? "";
      if (!assistantText) {
        throw new Error("empty_llm_response");
      }
      console.log(`[StandardVoiceTrace:${traceId}] llm_ok`, { chars: assistantText.length });
      stages.push("llm_ok");

      // ── STAGE 3: TTS (OpenAI Speech) ──
      console.log(`[StandardVoiceTrace:${traceId}] tts_start`);
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("configuration_error");

      const ttsResponse = await runWithOpenAICircuit(() =>
        fetchWithTimeout(OPENAI_TTS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            voice: voiceId,
            input: assistantText,
            format: "mp3",
          }),
          timeoutMs: OPENAI_TTS_TIMEOUT_MS,
        })
      );

      if (!ttsResponse.ok) {
        recordOpenAIFailure();
        const errorText = await ttsResponse.text().catch(() => "unknown");
        throw new Error(`tts_error: ${errorText}`);
      }

      const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
      const audioBase64 = audioBuffer.toString("base64");
      console.log(`[StandardVoiceTrace:${traceId}] tts_ok`, { audioBytes: audioBuffer.length });
      stages.push("tts_ok");

      return {
        userText,
        assistantText,
        audioBase64,
        audioFormat: "mp3" as const,
        voice_mode: "standard" as const,
      };
    }
  );

  // Handle operation result
  const isDev = process.env.NODE_ENV === "development";

  if (!result.success) {
    const errorMsg = result.error?.toLowerCase() || "";

    if (isCircuitOpenError(new Error(result.error))) {
      return serviceUnavailableResponse();
    }

    safeErrorLog(`[StandardVoiceTrace:${traceId}] operation failed`, new Error(result.error));

    // Specific error codes instead of generic 500
    if (errorMsg.includes("empty_transcription")) {
      const errRes = NextResponse.json(
        { error: "EMPTY_TRANSCRIPTION", message: "Could not understand audio. Please try again." },
        { status: 422 },
      );
      errRes.headers.set("x-vella-trace-id", traceId);
      return errRes;
    }

    if (errorMsg.includes("tts_error")) {
      const errPayload: Record<string, unknown> = {
        error: "VOICE_INVALID",
        message: "Voice synthesis failed. The selected voice may be invalid.",
      };
      if (isDev) {
        errPayload.__debug = { trace_id: traceId, resolvedVoice: voiceId, rawVoiceId, errorDetail: result.error };
      }
      const errRes = NextResponse.json(errPayload, { status: 400 });
      errRes.headers.set("x-vella-trace-id", traceId);
      if (isDev) errRes.headers.set("x-vella-resolved-voice", voiceId);
      return errRes;
    }

    if (errorMsg.includes("insufficient") || errorMsg.includes("quota") || errorMsg.includes("balance")) {
      const errRes = NextResponse.json(
        { error: "INSUFFICIENT_BALANCE", message: "Not enough tokens for voice processing." },
        { status: 402 },
      );
      errRes.headers.set("x-vella-trace-id", traceId);
      return errRes;
    }

    // Genuine 500 — still include trace_id for debugging
    const errPayload: Record<string, unknown> = {
      error: "INTERNAL_ERROR",
      message: "Voice processing failed. Please try again.",
    };
    if (isDev) {
      errPayload.__debug = { trace_id: traceId, resolvedVoice: voiceId, rawVoiceId, errorDetail: result.error, stages };
    }
    const errRes = NextResponse.json(errPayload, { status: 500 });
    errRes.headers.set("x-vella-trace-id", traceId);
    return errRes;
  }

  // Success
  const elapsed = Date.now() - tsStart;
  stages.push("success");
  console.log(`[StandardVoiceTrace:${traceId}] success`, { elapsed, stages });

  const payload: Record<string, unknown> = {
    userText: result.data.userText,
    assistantText: result.data.assistantText,
    audioBase64: result.data.audioBase64,
    audioFormat: result.data.audioFormat,
    voice_mode: result.data.voice_mode,
  };

  if (debug || isDev) {
    payload.__debug = {
      trace_id: traceId,
      plan,
      voice_mode: "standard",
      stage: "success",
      stt_ok: true,
      llm_ok: true,
      tts_ok: true,
      elapsed_ms: elapsed,
      stages,
      resolvedVoice: voiceId,
      rawVoiceId,
    };
  }

  const res = NextResponse.json(payload);
  res.headers.set("x-vella-trace-id", traceId);
  if (isDev) res.headers.set("x-vella-resolved-voice", voiceId);
  return res;
}
