/**
 * POST /api/migration/complete
 * Sets migration_state.status = COMPLETED for the authenticated user.
 * Call after client has imported legacy data locally and is ready to lock export.
 */

import { NextResponse } from "next/server";
import { setMigrationCompleted } from "@/lib/migration/state";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";

const RATE_LIMIT = { limit: 5, window: 60 };
const ROUTE_KEY = "migration_complete";

export async function POST() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `migration_complete:${userId}`,
    limit: RATE_LIMIT.limit,
    window: RATE_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  await setMigrationCompleted(userId);
  return NextResponse.json({ ok: true, status: "COMPLETED" });
}
