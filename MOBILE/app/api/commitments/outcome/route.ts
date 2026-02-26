/**
 * POST /api/commitments/outcome
 * Log a commitment outcome (completed/skipped/missed) to behaviour_events.
 * Metadata-only. Does NOT modify governance_state directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { LogOutcomeSchema } from "@/lib/execution/validation";
import { logOutcome, getOutcomeEvents } from "@/lib/execution/outcomeStore";
import { getCommitment } from "@/lib/execution/commitmentStore";

const RATE = { limit: 60, window: 60 };

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `user:commitments:outcome:${userId}`, limit: RATE.limit, window: RATE.window });
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

  const parsed = LogOutcomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Verify ownership
  const existing = await getCommitment(userId, input.commitment_id);
  if (!existing) {
    return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  }

  const result = await logOutcome({
    userId,
    commitmentId: input.commitment_id,
    outcomeCode: input.outcome_code,
    occurredAt: input.occurred_at_iso,
    windowStart: input.window_start_iso,
    windowEnd: input.window_end_iso,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ id: result.id }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `user:commitments:outcome:read:${userId}`, limit: RATE.limit, window: RATE.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const commitmentId = searchParams.get("commitment_id");
  const days = Math.min(Math.max(Number(searchParams.get("days") ?? "7"), 1), 90);

  if (!commitmentId) {
    return NextResponse.json({ error: "commitment_id required" }, { status: 400 });
  }

  const result = await getOutcomeEvents(userId, commitmentId, days);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ events: result.events });
}
