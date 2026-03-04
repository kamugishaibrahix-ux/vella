import { NextRequest, NextResponse } from "next/server";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { extractStrengthsAndValues } from "@/lib/insights/identity";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { listGoals } from "@/lib/goals/goalEngine";
import { generateEmotionalForecast } from "@/lib/forecast/generateEmotionalForecast";
import { collectWeeklySignals } from "@/lib/review/weeklyReview";
import { generateGrowthRoadmap } from "@/lib/insights/growthRoadmap";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import { resolveServerLocale } from "@/i18n/serverLocale";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };
const ROUTE_KEY = "roadmap";

export async function GET(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const rateLimitResult = await rateLimit({
    key: `read:roadmap:${userId}`,
    limit: READ_LIMIT.limit,
    window: READ_LIMIT.window,
    routeKey: ROUTE_KEY,
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) return rateLimit503Response();
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  const locale = resolveServerLocale();
  try {
    const [
      traits,
      strengthsValues,
      themes,
      loops,
      distortions,
      goalsLife,
      goalsFocus,
      goalsWeekly,
      forecast,
      weeklySignals,
      personaSettings,
    ] = await Promise.all([
      getUserTraits(userId).catch(() => null),
      extractStrengthsAndValues(userId).catch(() => null),
      getLifeThemes(userId).catch(() => []),
      getBehaviourLoops(userId).catch(() => []),
      getCognitiveDistortions(userId).catch(() => []),
      listGoals(userId, "life").catch(() => []),
      listGoals(userId, "focus").catch(() => []),
      listGoals(userId, "weekly").catch(() => []),
      generateEmotionalForecast(userId).catch(() => null),
      collectWeeklySignals(userId).catch(() => null),
      loadServerPersonaSettings(userId).catch(() => null),
    ]);

    const persona =
      personaSettings && Object.keys(personaSettings).length > 0
        ? {
            voiceModel: personaSettings.voiceModel,
            toneStyle: personaSettings.toneStyle ?? personaSettings.tone ?? null,
            relationshipMode: personaSettings.relationshipMode ?? null,
            language: (personaSettings.language as SupportedLanguage | null | undefined) ?? null,
            behaviourVector: null,
            monitoring: null,
          }
        : null;

    const roadmap = await generateGrowthRoadmap({
      userId: userId,
      traits,
      strengthsValues,
      themes,
      loops,
      distortions,
      goals: {
        life: goalsLife,
        focus: goalsFocus,
        weekly: goalsWeekly,
      },
      forecast,
      weeklySignals,
      persona,
      personaSettings,
      locale,
    }).catch(() => ({ shortTerm: [], midTerm: [], longTerm: [] }));

    return NextResponse.json({
      roadmap,
      traits,
      goals: {
        life: goalsLife,
        focus: goalsFocus,
        weekly: goalsWeekly,
      },
      forecast,
      themes,
      strengthsValues,
      loops,
      distortions,
      weeklySignals,
    });
  } catch (error) {
    safeErrorLog("[api/roadmap] error", error);
    return NextResponse.json({
      roadmap: { shortTerm: [], midTerm: [], longTerm: [] },
      traits: [],
      goals: { life: [], focus: [], weekly: [] },
      forecast: null,
      themes: [],
      strengthsValues: null,
      loops: [],
      distortions: [],
      weeklySignals: null,
    }, { status: 200 });
  }
}

