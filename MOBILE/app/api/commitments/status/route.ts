/**
 * POST /api/commitments/status
 * Change commitment status (pause/resume/complete/abandon).
 * Logs commitment_status_changed event to behaviour_events.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { ChangeStatusSchema } from "@/lib/execution/validation";
import { changeCommitmentStatus, getCommitment } from "@/lib/execution/commitmentStore";
import { recordEvent } from "@/lib/governance/events";

const RATE = { limit: 30, window: 60 };
const ROUTE_KEY = "commitments_status";

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `user:commitments:status:${userId}`,
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

  const parsed = ChangeStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { commitment_id, new_status } = parsed.data;

  // Verify ownership
  const existing = await getCommitment(userId, commitment_id);
  if (!existing) {
    return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  }

  const result = await changeCommitmentStatus(userId, commitment_id, new_status);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Log status change event (best-effort)
  // Domain code goes in metadata — NOT in governance subject_code
  await recordEvent(
    userId,
    "commitment_status_changed",
    null,
    undefined,
    { old_status: existing.status, new_status, commitment_id, domain_code: existing.subject_code ?? "other" }
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
