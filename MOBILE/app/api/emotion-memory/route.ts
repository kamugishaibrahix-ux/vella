import { NextRequest, NextResponse } from "next/server";
import {
  saveEmotionalMemorySnapshot,
  type EmotionalMemorySample,
} from "@/lib/memory/conversation";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

// Client-supplied user identity is never trusted: it would allow any client to write
// emotional memory for any user. All writes are bound to the authenticated user only.

/** Read-only tier: 60 req/60s per user (lightweight write) */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "emotion_memory";

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:emotion_memory:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const body = (await req.json().catch(() => null)) as { samples?: unknown } | null;
    const rawSamples = body?.samples;

    if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
      return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 400 });
    }

    // Basic type guard: expect objects with numeric fields used by EmotionalMemorySample
    const samples = rawSamples.filter(
      (s): s is EmotionalMemorySample =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as EmotionalMemorySample).valence === "number" &&
        typeof (s as EmotionalMemorySample).warmth === "number" &&
        typeof (s as EmotionalMemorySample).curiosity === "number" &&
        typeof (s as EmotionalMemorySample).tension === "number"
    );

    if (samples.length === 0) {
      return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 400 });
    }

    await saveEmotionalMemorySnapshot(userId, samples);
    return NextResponse.json({ ok: true });
  } catch (error) {
    safeErrorLog("[emotion-memory] failed to persist emotional snapshot", error);
    return NextResponse.json({ ok: false, reason: "server_error" }, { status: 500 });
  }
}
