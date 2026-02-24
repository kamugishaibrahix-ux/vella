import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

/** Utility tier (legacy endpoint): 10 req/60s per IP */
const UTILITY_LIMIT = { limit: 10, window: 60 };

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimit({ key: `ip:voice_transcribe:${ip}`, limit: UTILITY_LIMIT.limit, window: UTILITY_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }
  return NextResponse.json(
    {
      error: "legacy_stt_disabled",
      message: "Server-side transcription has been retired. Use the realtime session.",
    },
    { status: 410 },
  );
}

