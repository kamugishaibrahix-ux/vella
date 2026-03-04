import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { fromSafe } from "@/lib/supabase/admin";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";

const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "state_history";

const SNAPSHOT_TYPES = ["daily", "weekly", "triggered"] as const;

/**
 * GET /api/state/history
 * Returns minimal snapshot history for the authenticated user.
 * Query: type (optional), limit (default 10, max 50).
 */
export async function GET(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:state_history:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  const { searchParams } = new URL(req.url);
  const typeParam = searchParams.get("type");
  const type = typeParam && SNAPSHOT_TYPES.includes(typeParam as (typeof SNAPSHOT_TYPES)[number])
    ? (typeParam as (typeof SNAPSHOT_TYPES)[number])
    : undefined;
  const limitParam = searchParams.get("limit");
  const limit = Math.min(
    Math.max(limitParam ? parseInt(limitParam, 10) : 10, 1),
    50,
  );

  try {
    let query = fromSafe("behavioural_state_history")
      .select("id, version, snapshot_type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq("snapshot_type", type);
    }

    const { data, error } = await query;

    if (error) {
      safeErrorLog("[api/state/history] select error", error);
      return serverErrorResponse();
    }

    const rows = (data ?? []).map((row: { id: string; version: number; snapshot_type: string; created_at: string }) => ({
      id: row.id,
      version: row.version,
      snapshotType: row.snapshot_type,
      createdAtISO: row.created_at,
    }));

    return NextResponse.json(rows);
  } catch (error) {
    safeErrorLog("[api/state/history] error", error);
    return serverErrorResponse();
  }
}
