/**
 * GET /api/commitments/list
 * Returns active + paused commitments for the authenticated user.
 * Metadata-only response.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { listCommitments } from "@/lib/execution/commitmentStore";

const RATE = { limit: 60, window: 60 };
const ROUTE_KEY = "commitments_list";

export async function GET(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `user:commitments:list:${userId}`,
    limit: RATE.limit,
    window: RATE.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  const result = await listCommitments(userId);
  if (result.error) {
    console.warn("[API_GATE]", {
      endpoint: "/api/commitments/list",
      gate: "COMMIT-01",
      status: 500,
      code: "COMMITMENTS_SELECT_ERROR",
      reason: `commitments query failed: ${result.error}`,
    });
    return NextResponse.json({ code: "COMMITMENTS_SELECT_ERROR", error: result.error, reason: `commitments query failed: ${result.error}` }, { status: 500 });
  }

  return NextResponse.json({ commitments: result.commitments });
}
