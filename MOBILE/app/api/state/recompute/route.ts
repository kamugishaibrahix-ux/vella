import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { recomputeState } from "@/lib/engine/behavioural/recomputeState";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";

const RECOMPUTE_LIMIT = { limit: 5, window: 60 };
const ROUTE_KEY = "state_recompute";

const bodySchema = z.object({
  snapshotType: z.enum(["daily", "weekly", "triggered"]).optional(),
  window: z
    .object({
      startISO: z.string(),
      endISO: z.string(),
    })
    .optional(),
});

/**
 * POST /api/state/recompute
 * Triggers a full deterministic recompute and optionally appends a snapshot to history.
 */
export async function POST(req: Request) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `state_recompute:${userId}`,
    limit: RECOMPUTE_LIMIT.limit,
    window: RECOMPUTE_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return validationErrorResponse(formatZodError(parsed.error));
    }
    body = parsed.data;
  } catch {
    body = {};
  }

  try {
    const result = await recomputeState({
      userId,
      snapshotType: body.snapshotType,
      window: body.window,
      reason: "api_recompute",
    });
    return NextResponse.json({
      version: result.version,
      computedAtISO: result.computedAtISO,
    });
  } catch (error) {
    safeErrorLog("[api/state/recompute] error", error);
    return serverErrorResponse();
  }
}
