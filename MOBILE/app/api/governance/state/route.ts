import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { getGovernanceStateForUser } from "@/lib/governance/readState";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";

const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "governance_state";

/**
 * Derive tone band from governance risk score (0–10).
 * Maps to 3 bands without exposing the raw score.
 */
function deriveToneBand(riskScore: number): "steady" | "supportive" | "grounding" {
  if (riskScore <= 3) return "steady";
  if (riskScore <= 6) return "supportive";
  return "grounding";
}

/**
 * GET /api/governance/state
 * Returns the authenticated user's governance state (deterministic spine).
 * Never exposes raw risk_score. Returns derived tone band instead.
 */
export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:governance_state:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const state = await getGovernanceStateForUser(userId);
    return NextResponse.json({
      recoveryState: state.recoveryState,
      disciplineState: state.disciplineState,
      focusState: state.focusState,
      escalationLevel: state.escalationLevel,
      toneBand: deriveToneBand(state.riskScore),
      lastComputedAtIso: state.lastComputedAtIso,
    });
  } catch (error) {
    safeErrorLog("[api/governance/state] error", error);
    return serverErrorResponse();
  }
}
