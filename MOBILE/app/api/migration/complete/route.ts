/**
 * POST /api/migration/complete
 * Sets migration_state.status = COMPLETED for the authenticated user.
 * Call after client has imported legacy data locally and is ready to lock export.
 */

import { NextResponse } from "next/server";
import { setMigrationCompleted } from "@/lib/migration/state";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

const RATE_LIMIT = { limit: 5, window: 60 };

export async function POST() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `migration_complete:${userId}`, limit: RATE_LIMIT.limit, window: RATE_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  await setMigrationCompleted(userId);
  return NextResponse.json({ ok: true, status: "COMPLETED" });
}
