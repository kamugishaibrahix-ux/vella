import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { runWithOpenAICircuit, isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { AI_ENDPOINTS } from "@/lib/security/aiEndpointPolicy";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

export const runtime = "nodejs";

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

const ESTIMATED_TOKENS = 1000;
const { maxFileSizeBytes, allowedMimeTypes } = AI_ENDPOINTS.transcribe;

export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `transcribe:${userId}`, limit: 10, window: 300 });

    const plan = await getUserPlanTier(userId).catch(() => "free" as const);
    const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "transcribe", "text");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ code: "INVALID_REQUEST", message: "Expected multipart/form-data upload." }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ code: "INVALID_REQUEST", message: "Audio file missing or invalid." }, { status: 400 });
    }

    if (file.size > maxFileSizeBytes) {
      return NextResponse.json(
        { code: "PAYLOAD_TOO_LARGE", message: "Audio file exceeds maximum size." },
        { status: 413 },
      );
    }

    const mime = (file.type || "").toLowerCase().split(";")[0]?.trim();
    if (!mime || !allowedMimeTypes.includes(mime as (typeof allowedMimeTypes)[number])) {
      return NextResponse.json(
        { code: "INVALID_MEDIA_TYPE", message: "Unsupported audio format." },
        { status: 415 },
      );
    }

    let audioFile: File;
    if (file instanceof File) {
      audioFile = file;
    } else {
      const blob = file as Blob;
      audioFile = new File([blob], "recording.webm", { type: blob.type || "audio/webm" });
    }

    const client = openai;
    if (!client) {
      return serviceUnavailableResponse();
    }
    const transcript = await runWithOpenAICircuit(() =>
      client.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
      })
    );

    await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "transcription", "transcribe", "text");

    return NextResponse.json({
      text: (transcript as { text?: string })?.text?.trim() ?? "",
      confidence: 1,
    });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[transcribe] WHISPER_ERROR", err);
    const errorMessage = err instanceof Error ? err.message : "Transcription failed";
    return serverErrorResponse(errorMessage);
  }
}
