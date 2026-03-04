import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { runWithOpenAICircuit, isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { AI_ENDPOINTS } from "@/lib/security/aiEndpointPolicy";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

export const runtime = "nodejs";

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

const ESTIMATED_TOKENS = 1000;
const { maxFileSizeBytes, allowedMimeTypes } = AI_ENDPOINTS.transcribe;

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal audio IN MEMORY ONLY via OpenAI Whisper.
 * - Accepts audio file for transcription
 * - Audio is processed and text returned
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

  // Step 1: Entitlement check (transcribe requires enableVoiceTTS)
  const entitlementResult = await requireEntitlement("transcribe");
  if (isEntitlementBlocked(entitlementResult)) {
    return entitlementResult;
  }
  const { userId, plan } = entitlementResult;

  // Step 2: Rate limit (must be before token operations)
  const rateLimitResult = await rateLimit({
    key: `transcribe:${userId}`,
    limit: 10,
    window: 300,
    routeKey: "transcribe",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 3: Check token availability (early 402)
  const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "transcribe", "text");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse();
  }

  // Step 4: Request validation (must happen before charging)
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

  // Step 5: ABORT-SAFE MONETISED OPERATION
  // The wrapper guarantees refund if client aborts or any error occurs
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens: ESTIMATED_TOKENS,
      operation: "transcription",
      route: "transcribe",
      channel: "text",
      featureKey: undefined,
      request: req,
    },
    async () => {
      // OpenAI call (may throw or be aborted)
      const transcript = await runWithOpenAICircuit(() =>
        client.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
        })
      );

      const text = (transcript as { text?: string })?.text?.trim() ?? "";
      if (!text) {
        throw new Error("empty_transcription");
      }

      return { text, confidence: 1 };
    }
  );

  // Handle operation result
  if (!result.success) {
    // Determine appropriate error response
    const errorMsg = result.error?.toLowerCase() || "";

    if (errorMsg.includes("circuit") || errorMsg.includes("circuit_open")) {
      return serviceUnavailableResponse();
    }

    // Log error for monitoring (refund already handled by wrapper)
    safeErrorLog("[transcribe] operation failed", new Error(result.error));
    return serverErrorResponse("Transcription failed. Please try again.");
  }

  // Success - return data
  return NextResponse.json(result.data);
}
