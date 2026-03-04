import { NextRequest, NextResponse } from "next/server";
import {
  listGoals,
  createGoal,
  updateGoalStatus,
  type GoalType,
  type GoalStatus,
} from "@/lib/goals/goalEngine";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

const GOALS_WRITE_RATE_LIMIT = { limit: 20, window: 60 };

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY_READ = "goals";
const ROUTE_KEY_WRITE = "goals";

export async function GET(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:goals:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY_READ,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const typeParam = req.nextUrl.searchParams.get("type") as GoalType | null;
    const type = typeParam && ["life", "focus", "weekly"].includes(typeParam) ? typeParam : undefined;
    const goals = await listGoals(userId, type);
    return NextResponse.json({ goals });
  } catch (error) {
    safeErrorLog("[api/goals] GET error", error);
    return NextResponse.json({ goals: [] }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `goals_write:${userId}`,
    limit: GOALS_WRITE_RATE_LIMIT.limit,
    window: GOALS_WRITE_RATE_LIMIT.window,
    routeKey: ROUTE_KEY_WRITE,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const body = await req.json();
    const { type, title, description, priority, target_date } = body ?? {};

    if (!type || !["life", "focus", "weekly"].includes(type) || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const goal = await createGoal(userId, {
      type,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      priority: typeof priority === "number" ? priority : undefined,
      target_date: typeof target_date === "string" ? target_date : undefined,
    });

    return NextResponse.json({ goal: goal ?? null });
  } catch (error) {
    if (error && typeof error === "object" && "retryAfterSeconds" in error) return rateLimit429Response((error as { retryAfterSeconds?: number }).retryAfterSeconds);
    safeErrorLog("[api/goals] POST error", error);
    return NextResponse.json({ goal: null }, { status: 200 });
  }
}

export async function PATCH(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `goals_write:${userId}`,
    limit: GOALS_WRITE_RATE_LIMIT.limit,
    window: GOALS_WRITE_RATE_LIMIT.window,
    routeKey: ROUTE_KEY_WRITE,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const body = await req.json();
    const { goalId, status } = body ?? {};

    if (typeof goalId !== "number" || !["active", "paused", "completed", "abandoned"].includes(status)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const goal = await updateGoalStatus(userId, goalId, status as GoalStatus);
    return NextResponse.json({ goal: goal ?? null });
  } catch (error) {
    if (error && typeof error === "object" && "retryAfterSeconds" in error) return rateLimit429Response((error as { retryAfterSeconds?: number }).retryAfterSeconds);
    safeErrorLog("[api/goals] PATCH error", error);
    return NextResponse.json({ goal: null }, { status: 200 });
  }
}

