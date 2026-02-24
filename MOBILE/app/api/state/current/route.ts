import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { fromSafe } from "@/lib/supabase/admin";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";

const READ_LIMIT = { limit: 60, window: 60 };

const DEFAULT_EMPTY_STATE = {
  traits: {},
  themes: [] as unknown[],
  loops: [] as unknown[],
  distortions: [] as unknown[],
  progress: {},
  connection_depth: 0,
  regulation: {},
  metadata: { window_start: "", window_end: "", sources: [] as string[] },
};

/**
 * GET /api/state/current
 * Returns the authenticated user's current behavioural state.
 * If no row exists, returns default empty state with version 0.
 */
export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({
      key: `read:state_current:${userId}`,
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
      safeErrorLog("[api/state/current] select error", error);
      return serverErrorResponse();
    }

    if (!data) {
      return NextResponse.json({
        version: 0,
        state: DEFAULT_EMPTY_STATE,
        lastComputedAtISO: undefined,
        updatedAtISO: undefined,
      });
    }

    const row = data as { state_json: unknown; version: number; last_computed_at: string | null; updated_at: string | null };
    const state = (row.state_json as Record<string, unknown>) ?? {};
    return NextResponse.json({
      version: row.version ?? 0,
      state: Object.keys(state).length ? state : DEFAULT_EMPTY_STATE,
      lastComputedAtISO: row.last_computed_at ?? undefined,
      updatedAtISO: row.updated_at ?? undefined,
    });
  } catch (error) {
    safeErrorLog("[api/state/current] error", error);
    return serverErrorResponse();
  }
}
