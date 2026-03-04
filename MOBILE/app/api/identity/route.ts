import { NextRequest, NextResponse } from "next/server";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { extractStrengthsAndValues } from "@/lib/insights/identity";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { listGoals } from "@/lib/goals/goalEngine";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { getBehaviouralStateForUser, tryRecomputeWithCooldown } from "@/lib/engine/behavioural/getState";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "identity";

export async function GET(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:identity:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    let state = await getBehaviouralStateForUser(userId);
    if (!state) {
      await tryRecomputeWithCooldown(userId);
      state = await getBehaviouralStateForUser(userId);
    }
    if (state?.state) {
      const s = state.state;
      return NextResponse.json({
        traits: s.traits && typeof s.traits === "object" ? s.traits : {},
        strengthsValues: null,
        themes: Array.isArray(s.themes) ? s.themes : [],
        loops: Array.isArray(s.loops) ? s.loops : [],
        distortions: Array.isArray(s.distortions) ? s.distortions : [],
        goals: { life: [], focus: [] },
      });
    }
    const localCheckins = await getAllCheckIns(userId).catch(() => []);
    void localCheckins;
    const [traits, strengthsValues, themes, loops, distortions, goalsLife, goalsFocus] =
      await Promise.all([
        getUserTraits(userId).catch(() => []),
        extractStrengthsAndValues(userId).catch(() => null),
        getLifeThemes(userId).catch(() => []),
        getBehaviourLoops(userId).catch(() => []),
        getCognitiveDistortions(userId).catch(() => []),
        listGoals(userId, "life").catch(() => []),
        listGoals(userId, "focus").catch(() => []),
      ]);

    return NextResponse.json({
      traits,
      strengthsValues,
      themes,
      loops,
      distortions,
      goals: {
        life: goalsLife,
        focus: goalsFocus,
      },
    });
  } catch (error) {
    safeErrorLog("[api/identity] error", error);
    return NextResponse.json({
      traits: [],
      strengthsValues: null,
      themes: [],
      loops: [],
      distortions: [],
      goals: { life: [], focus: [] },
    }, { status: 200 });
  }
}

