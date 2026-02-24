import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

const bodySchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    category: z.string().min(1).max(64),
    message: z.string().max(2000).optional().nullable(),
    session_id: z.string().uuid().optional().nullable(),
  })
  .strict();

const RATE_LIMIT_FEEDBACK = { limit: 10, window: 60 };

export async function POST(request: Request) {
  try {
    const userIdOr401 = await requireUserId();
    if (userIdOr401 instanceof Response) return userIdOr401;
    const userId = userIdOr401;

    try {
      await rateLimit({ key: `feedback_create:${userId}`, limit: RATE_LIMIT_FEEDBACK.limit, window: RATE_LIMIT_FEEDBACK.window });
    } catch (err: unknown) {
      if (isRateLimitError(err)) {
        return rateLimit429Response(err.retryAfterSeconds);
      }
      throw err;
    }

    const body = bodySchema.parse(await request.json());

    // Insert into feedback table
    // Note: feedback table expects rating 1-10, but we're using 1-5 for simplicity
    // Convert 1-5 to 1-10 scale: (rating * 2)
    // feedback.user_id references profiles.id, so we use userId directly (profiles.id = auth.users.id in local mode)
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: "Server not configured." }, { status: 503 });
    }
    const { error } = await safeInsert(
      "feedback",
      {
        user_id: userId,
        session_id: body.session_id ?? null,
        rating: body.rating * 2, // Convert 1-5 to 1-10 scale
        channel: "text",
        category: body.category ?? null,
      },
      undefined,
      supabaseAdmin,
    );

    if (error) {
      safeErrorLog("[api/feedback/create] Error", error);
      return NextResponse.json({ success: false, error: "Failed to submit feedback." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    safeErrorLog("[api/feedback/create] Error", error);
    const message = error instanceof z.ZodError ? "VALIDATION_ERROR" : "Failed to submit feedback.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

