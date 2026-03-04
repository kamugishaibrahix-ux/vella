import { NextRequest, NextResponse } from "next/server";
import { getEmotionalPatterns } from "@/lib/patterns/getEmotionalPatterns";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { listGoals } from "@/lib/goals/goalEngine";
import { generateRegulationStrategies } from "@/lib/regulation/generateRegulationStrategies";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "regulation";

export async function GET(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:regulation:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  try {
    const [patternSummaryRaw, loops, distortions, traits, themes, goalsLife, goalsFocus] = await Promise.all([
      getEmotionalPatterns(userId).catch(() => null),
      getBehaviourLoops(userId).catch(() => []),
      getCognitiveDistortions(userId).catch(() => []),
      getUserTraits(userId).catch(() => null),
      getLifeThemes(userId).catch(() => []),
      listGoals(userId, "life").catch(() => []),
      listGoals(userId, "focus").catch(() => []),
    ]);

    const patternSummary = patternSummaryRaw ? { patterns: patternSummaryRaw.patterns, planTier: patternSummaryRaw.planTier } : null;

    const strategies = await generateRegulationStrategies({
      patterns: patternSummary,
      loops,
      distortions,
      traits,
      themes,
      goals: {
        life: goalsLife,
        focus: goalsFocus,
      },
    }).catch(() => []);

    return NextResponse.json({
      strategies,
      patterns: patternSummary,
      loops,
      distortions,
      themes,
      traits,
      goals: {
        life: goalsLife,
        focus: goalsFocus,
      },
    });
  } catch (error) {
    safeErrorLog("[api/regulation] error", error);
    return NextResponse.json({
      strategies: [],
      patterns: null,
      loops: [],
      distortions: [],
      themes: [],
      traits: null,
      goals: { life: [], focus: [] },
    }, { status: 200 });
  }
}

