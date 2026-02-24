/**
 * GET /api/journal/console
 * Returns governance_state, behavioural_state_current, and recent behaviour_events
 * for the Behavioural Console (metrics strip + reaction feed). No user text.
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";
import { getGovernanceStateForUser } from "@/lib/governance/readState";
import { listEvents } from "@/lib/governance/events";
import { fromSafe } from "@/lib/supabase/admin";

const READ_LIMIT = { limit: 60, window: 60 };

export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({
      key: `read:journal_console:${userId}`,
      limit: READ_LIMIT.limit,
      window: READ_LIMIT.window,
    });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const [governance, eventsResult, stateRow] = await Promise.all([
      getGovernanceStateForUser(userId),
      listEvents(userId, { limit: 20 }),
      fromSafe("behavioural_state_current")
        .select("state_json")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const state = (stateRow.data as { state_json?: Record<string, unknown> } | null)?.state_json ?? {};
    const events = eventsResult.events ?? [];

    return NextResponse.json({
      governance: {
        riskScore: governance.riskScore,
        escalationLevel: governance.escalationLevel,
        recoveryState: governance.recoveryState,
        disciplineState: governance.disciplineState,
        focusState: governance.focusState,
      },
      state: {
        progress: state.progress ?? {},
        connectionDepth: typeof state.connection_depth === "number" ? state.connection_depth : 0,
      },
      recentEvents: events.map((e: { id: string; event_type: string; occurred_at: string; subject_code: string | null; metadata: unknown }) => ({
        id: e.id,
        event_type: e.event_type,
        occurred_at: e.occurred_at,
        subject_code: e.subject_code ?? null,
        metadata: (e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata) ? e.metadata : {}) as Record<string, unknown>,
      })),
    });
  } catch (error) {
    safeErrorLog("[api/journal/console] error", error);
    return serverErrorResponse();
  }
}
