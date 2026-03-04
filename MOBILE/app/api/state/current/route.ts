import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { fromSafe } from "@/lib/supabase/admin";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";

const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "state_current";

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

  const rateLimitResult = await rateLimit({
    key: `read:state_current:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const { data, error } = await fromSafe("behavioural_state_current")
      .select("version, state_json, last_computed_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      const pgCode = (error as any).code;
      // PGRST205 = table not found in schema cache — table does not exist in DB
      // Gracefully return default empty state instead of 500
      if (pgCode === "PGRST205") {
        console.warn("[api/state/current] behavioural_state_current table not found (PGRST205) — returning default state");
        return NextResponse.json({
          version: 0,
          state: DEFAULT_EMPTY_STATE,
          lastComputedAtISO: undefined,
          updatedAtISO: undefined,
        });
      }
      console.warn("[API_GATE]", {
        endpoint: "/api/state/current",
        gate: "STATE-01",
        status: 500,
        code: "BEHAVIOURAL_STATE_SELECT_ERROR",
        reason: `behavioural_state_current select failed: ${error.message}`,
      });
      console.error("[api/state/current] select error:", { message: error.message, code: pgCode, details: (error as any).details, hint: (error as any).hint });
      return serverErrorResponse(`behavioural_state_current query failed: ${error.message}`);
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
    const errMsg = error instanceof Error ? error.message : typeof error === "object" && error !== null ? JSON.stringify({ message: (error as any).message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint }) : String(error);
    console.warn("[API_GATE]", {
      endpoint: "/api/state/current",
      gate: "STATE-02",
      status: 500,
      code: "UNEXPECTED_ERROR",
      reason: errMsg,
    });
    console.error("[api/state/current] catch-all error:", errMsg);
    safeErrorLog("[api/state/current] error", error);
    return serverErrorResponse(errMsg);
  }
}
