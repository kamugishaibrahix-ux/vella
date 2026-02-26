/**
 * POST /api/execution/trigger/log
 * Logs a trigger_fired event to behaviour_events.
 * subject_code is always null — domain info goes in metadata JSON.
 * Server-side dedupe: if idempotency_key already exists, returns 200 (no duplicate insert).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { TriggerLogSchema } from "@/lib/execution/triggerValidation";
import { recordEvent } from "@/lib/governance/events";
import { fromSafe } from "@/lib/supabase/admin";

const RATE = { limit: 30, window: 60 };

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `user:trigger:log:${userId}`, limit: RATE.limit, window: RATE.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = TriggerLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Server-side dedupe: check if idempotency_key already exists
  try {
    const { data: existing } = await fromSafe("behaviour_events")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", "trigger_fired")
      .contains("metadata", { idempotency_key: input.idempotency_key } as Record<string, unknown>)
      .limit(1)
      .maybeSingle() as { data: { id: string } | null };

    if (existing) {
      return NextResponse.json({ ok: true, deduped: true, existing_id: existing.id }, { status: 200 });
    }
  } catch {
    // Dedupe check failed — proceed with insert (safe fallback)
  }

  // Log trigger_fired event — subject_code null, everything in metadata
  const result = await recordEvent(
    userId,
    "trigger_fired",
    null,
    undefined,
    {
      commitment_id: input.commitment_id,
      domain_code: input.domain_code,
      trigger_type: input.trigger_type,
      window_start_iso: input.window_start_iso,
      window_end_iso: input.window_end_iso,
      idempotency_key: input.idempotency_key,
    }
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deduped: false, id: result.id }, { status: 201 });
}
