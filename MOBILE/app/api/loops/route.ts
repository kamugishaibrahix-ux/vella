import { NextRequest, NextResponse } from "next/server";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { listGoals } from "@/lib/goals/goalEngine";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { getBehaviouralStateForUser, tryRecomputeWithCooldown } from "@/lib/engine/behavioural/getState";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };

export async function GET(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:loops:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
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
        loops: Array.isArray(s.loops) ? s.loops : [],
        traits: s.traits && typeof s.traits === "object" ? s.traits : {},
        themes: Array.isArray(s.themes) ? s.themes : [],
        distortions: Array.isArray(s.distortions) ? s.distortions : [],
        goals: { life: [], focus: [] },
      });
    }
    const [loops, traits, themes, distortions, goalsLife, goalsFocus] = await Promise.all([
      getBehaviourLoops(userId).catch(() => []),
      getUserTraits(userId).catch(() => []),
      getLifeThemes(userId).catch(() => []),
      getCognitiveDistortions(userId).catch(() => []),
      listGoals(userId, "life").catch(() => []),
      listGoals(userId, "focus").catch(() => []),
    ]);

    return NextResponse.json({
      loops,
      traits,
      themes,
      distortions,
      goals: {
        life: goalsLife,
        focus: goalsFocus,
      },
    });
  } catch (error) {
    safeErrorLog("[api/loops] error", error);
    return NextResponse.json({
      loops: [],
      traits: [],
      themes: [],
      distortions: [],
      goals: { life: [], focus: [] },
    }, { status: 200 });
  }
}

