// Deprecated: Vella now uses local storage only
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

/** Utility reset tier: 10 req/60s per IP */
const RESET_LIMIT = { limit: 10, window: 60 };

export async function DELETE(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimit({ key: `ip:conversation_reset:${ip}`, limit: RESET_LIMIT.limit, window: RESET_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }
  return NextResponse.json({ status: "reset_disabled_local_memory_only" });
}

