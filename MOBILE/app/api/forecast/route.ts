import { NextRequest, NextResponse } from "next/server";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { generateEmotionalForecast } from "@/lib/forecast/generateEmotionalForecast";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { getPreviousTraitSnapshot } from "@/lib/traits/getPreviousTraitSnapshot";
import { computeTraitDeltas } from "@/lib/traits/traitDeltas";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { listGoals } from "@/lib/goals/goalEngine";
import { computeBehaviourRiskFlags } from "@/lib/forecast/computeBehaviourRiskFlags";
import { resolveServerLocale } from "@/i18n/serverLocale";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

/** Read-only tier: 60 req/60s per user */
const READ_LIMIT = { limit: 60, window: 60 };

export async function GET(_req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:forecast:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const locale = resolveServerLocale();
    const localCheckins = await getAllCheckIns(userId).catch(() => []);
      void localCheckins;
    const payload = await buildForecastPayload(userId, locale);
    return NextResponse.json(payload);
  } catch (error) {
    safeErrorLog("[api/forecast] GET error", error);
    return NextResponse.json(
      { shortTerm: { mood: 5, energy: 5, stress: 5, confidence: 0.4 }, weekTrend: "stable" },
      { status: 200 },
    );
  }
}

export async function POST(req: NextRequest) {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `read:forecast:${userId}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const locale = resolveServerLocale();
    const localCheckins = await getAllCheckIns(userId).catch(() => []);
      void localCheckins;
    await req.json().catch(() => ({}));

    const payload = await buildForecastPayload(userId, locale);
    return NextResponse.json(payload);
  } catch (error) {
    safeErrorLog("[api/forecast] POST error", error);
    return NextResponse.json(
      { shortTerm: { mood: 5, energy: 5, stress: 5, confidence: 0.4 }, weekTrend: "stable" },
      { status: 200 },
    );
  }
}

async function buildForecastPayload(userId: string | null, locale: string) {
  // If no userId, return minimal payload
  if (!userId) {
    return {
      forecast: null,
      shortTerm: { mood: 5, energy: 5, stress: 5, confidence: 0.4 },
      weekTrend: "stable",
      traits: { now: [], prev: [], deltas: [] },
      themes: [],
      loops: [],
      distortions: [],
      goals: { life: [], focus: [] },
      riskFlags: [],
    };
  }

  const [
    forecast,
    traitsNow,
    traitsPrev,
    themes,
    loops,
    distortions,
    goalsLife,
    goalsFocus,
  ] = await Promise.all([
    generateEmotionalForecast(userId).catch(() => null),
    getUserTraits(userId).catch(() => null),
    getPreviousTraitSnapshot(userId).catch(() => null),
    getLifeThemes(userId).catch(() => []),
    getBehaviourLoops(userId).catch(() => []),
    getCognitiveDistortions(userId).catch(() => []),
    listGoals(userId, "life").catch(() => []),
    listGoals(userId, "focus").catch(() => []),
  ]);

  const traitDeltas = computeTraitDeltas(traitsNow ?? null, traitsPrev ?? null);
  const riskFlags = await computeBehaviourRiskFlags(userId, {
    loops,
    distortions,
    forecast,
    traitDeltas,
  }).catch(() => []);

  return {
    forecast,
    shortTerm: forecast?.shortTerm ?? null,
    weekTrend: forecast?.weekTrend ?? null,
    traits: {
      now: traitsNow,
      prev: traitsPrev,
      deltas: traitDeltas,
    },
    themes,
    loops,
    distortions,
    goals: {
      life: goalsLife,
      focus: goalsFocus,
    },
    riskFlags,
  };
}

