// Summary: DEV-ONLY endpoint to view token dry-run telemetry logs
// This endpoint MUST NOT be available in production

import { NextResponse } from "next/server";
import { getDryRunEvents } from "@/lib/tokens/tokenDryRunLog";
import { rateLimit, getClientIp, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-like tier (dev only): 60 req/60s per IP */
const DEV_READ_LIMIT = { limit: 60, window: 60 };

export async function GET(req: Request) {
  // DEV-ONLY: Block in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "This endpoint is only available in development mode" },
      { status: 403 },
    );
  }

  try {
    const ip = getClientIp(req);
    await rateLimit({ key: `ip:dev_token_dry_run:${ip}`, limit: DEV_READ_LIMIT.limit, window: DEV_READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  // Parse limit query parameter (default: 50)
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  try {
    const events = getDryRunEvents(limit);
    return NextResponse.json({
      success: true,
      count: events.length,
      limit,
      events,
    });
  } catch (error) {
    safeErrorLog("[dev/token-dry-run] Error retrieving events", error);
    return NextResponse.json(
      { error: "Failed to retrieve dry-run events" },
      { status: 500 },
    );
  }
}

