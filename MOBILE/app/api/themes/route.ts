import { NextRequest, NextResponse } from "next/server";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { extractStrengthsAndValues } from "@/lib/insights/identity";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
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
    await rateLimit({ key: `read:themes:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
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
        themes: Array.isArray(s.themes) ? s.themes : [],
        strengthsValues: null,
        traits: s.traits && typeof s.traits === "object" ? s.traits : {},
        loops: Array.isArray(s.loops) ? s.loops : [],
        distortions: Array.isArray(s.distortions) ? s.distortions : [],
      });
    }
    const [themes, strengthsValues, traits, loops, distortions] = await Promise.all([
      getLifeThemes(userId).catch(() => []),
      extractStrengthsAndValues(userId).catch(() => null),
      getUserTraits(userId).catch(() => []),
      getBehaviourLoops(userId).catch(() => []),
      getCognitiveDistortions(userId).catch(() => []),
    ]);

    return NextResponse.json({
      themes,
      strengthsValues,
      traits,
      loops,
      distortions,
    });
  } catch (error) {
    safeErrorLog("[api/themes] error", error);
    return NextResponse.json({
      themes: [],
      strengthsValues: null,
      traits: [],
      loops: [],
      distortions: [],
    }, { status: 200 });
  }
}

