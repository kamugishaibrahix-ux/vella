/**
 * POST /api/commitments/create
 * Creates a new commitment (metadata-only in Supabase).
 * Also logs commitment_created event to behaviour_events.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { CreateCommitmentSchema } from "@/lib/execution/validation";
import { createCommitment } from "@/lib/execution/commitmentStore";
import { recordEvent } from "@/lib/governance/events";

const RATE = { limit: 30, window: 60 };
const ROUTE_KEY = "commitments_create";

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `user:commitments:create:${userId}`,
    limit: RATE.limit,
    window: RATE.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateCommitmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const input = parsed.data;

  const result = await createCommitment({
    userId,
    commitment_code: input.commitment_code,
    subject_code: input.subject_code,
    target_type: input.target_type,
    target_value: input.target_value,
    cadence_type: input.cadence_type,
    start_at: input.start_at,
    end_at: input.end_at ?? null,
    deadline_at: input.deadline_at ?? null,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Log commitment_created event (best-effort, don't fail the request)
  // Domain code goes in metadata — NOT in governance subject_code
  await recordEvent(
    userId,
    "commitment_created",
    null,
    input.target_value,
    { cadence_type: input.cadence_type, target_type: input.target_type, domain_code: input.subject_code }
  ).catch(() => {});

  return NextResponse.json({ id: result.id }, { status: 201 });
}
