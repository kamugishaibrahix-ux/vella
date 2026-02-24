import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { fromSafe } from "@/lib/supabase/admin";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";

const READ_LIMIT = { limit: 60, window: 60 };

/**
 * @deprecated Use GET /api/state/current instead. Kept for backward compatibility.
 * GET /api/behavioural-state
 * Returns the authenticated user's current behavioural state (Phase 6A).
 * Source of truth: behavioural_state_current. Call POST /api/state/recompute to refresh.
 */
export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({
      key: `read:behavioural_state:${userId}`,
      limit: READ_LIMIT.limit,
      window: READ_LIMIT.window,
    });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const { data, error } = await fromSafe("behavioural_state_current")
      .select("version, state_json, last_computed_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      safeErrorLog("[api/behavioural-state] select error", error);
      return serverErrorResponse();
    }

    if (!data) {
      return NextResponse.json({
        state: null,
        version: 0,
        lastComputedAt: null,
        updatedAt: null,
      });
    }

    const row = data as { state_json: unknown; version: number; last_computed_at: string | null; updated_at: string | null };
    return NextResponse.json({
      state: row.state_json ?? {},
      version: row.version ?? 0,
      lastComputedAt: row.last_computed_at ?? null,
      updatedAt: row.updated_at ?? null,
    });
  } catch (error) {
    safeErrorLog("[api/behavioural-state] error", error);
    return serverErrorResponse();
  }
}
