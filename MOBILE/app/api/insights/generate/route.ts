import { NextResponse } from "next/server";
import { openai, model } from "@/lib/ai/client";
import { runWithOpenAICircuit, isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { createChatCompletion } from "@/lib/ai/safeOpenAI";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { RATE_LIMIT_CONFIG } from "@/lib/security/rateLimit/config";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { buildInsightPrompt, buildLiteInsights } from "@/lib/insights/generator";
import type { DailyCheckIn, MemoryProfile } from "@/lib/memory/types";
import type { InsightCardData } from "@/lib/insights/types";
import { buildPersonaInstruction } from "@/lib/realtime/personaSynth";
import {
  computeDeliveryHints,
  type MoodState,
} from "@/lib/realtime/deliveryEngine";
import { createBaselineEmotionalState } from "@/lib/realtime/emotion/state";
import {
  DEFAULT_VELLA_VOICE_ID,
  normalizeVellaVoiceId,
  type VellaVoiceId,
} from "@/lib/voice/vellaVoices";
import type { TonePreference } from "@/lib/memory/types";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import { resolveServerLocale, normalizeLocale } from "@/i18n/serverLocale";
import type { UILanguageCode } from "@/i18n/types";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { estimateTokens } from "@/lib/tokens/costSchedule";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { insightsGenerateRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import { applyCheckinBounds, CHECKIN_MAX_ROWS } from "@/lib/insights/checkinBounds";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";

const FEATURE_KEY = "insight";
const DEFAULT_VOICE_HUD = {
  moodChip: true,
  stability: true,
  deliveryHints: true,
  sessionTime: true,
  tokenChip: true,
  strategyChip: true,
  alertChip: true,
};

type RequestPayload = ReturnType<typeof insightsGenerateRequestSchema.parse>;
type AuthenticatedRequestPayload = Omit<RequestPayload, "userId"> & { userId: string | null; locale?: UILanguageCode; planTier?: string };

type InsightResponse = {
  insights: InsightCardData[];
  insight: InsightCardData | null;
  patterns: unknown;
  emotionalShift: string | null;
  tokensUsed: number;
  mode: "lite" | "ai";
};

const FALLBACK_LANGUAGE: SupportedLanguage = "en";

const DEFAULT_SETTINGS = {
  tone: "soft" as TonePreference,
  toneStyle: "soft" as TonePreference,
  relationshipMode: "best_friend" as MemoryProfile["relationshipMode"],
  voiceModel: DEFAULT_VELLA_VOICE_ID,
  voiceHud: DEFAULT_VOICE_HUD,
};

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal text IN MEMORY ONLY.
 * - Generates insights via OpenAI
 * - Text is processed and results returned
 * - Text is NEVER stored in Supabase
 * - Only token usage metadata is recorded
 *
 * ABORT-SAFE REFUND (20260301):
 * Uses withMonetisedOperation wrapper to guarantee refund on client abort.
 */
export async function POST(req: Request) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  // Step 1+2: Require entitlement (includes active user check; insights_generate is always allowed)
  const entitlement = await requireEntitlement("insights_generate");
  if (isEntitlementBlocked(entitlement)) return entitlement;
  const { userId, plan } = entitlement;

  // Step 3: Rate limit (must be before token operations)
  const { limit, window } = RATE_LIMIT_CONFIG.routes.insights_generate;
  const rateLimitResult = await rateLimit({
    key: `insights_generate:${userId}`,
    limit,
    window,
    routeKey: "insights_generate",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      return rateLimit503Response("Rate limiting unavailable. Cannot process monetized requests.");
    }
    return rateLimit429Response(rateLimitResult.retryAfterSeconds);
  }

  // Step 4: Request validation
  try {
    const json = await req.json();
    const parseResult = insightsGenerateRequestSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const body = parseResult.data;
    const rawLocale = (body.locale as string) || resolveServerLocale();
    const locale = normalizeLocale(rawLocale) as UILanguageCode;

    // Apply deterministic bounds to incoming check-ins
    const boundedCheckins = applyCheckinBounds((body.checkins ?? []) as DailyCheckIn[]);

    const { userId: _ignored, checkins: _ignoredCheckins, ...rest } = body;
    const response = await generateInsightsServerSide({
      ...rest,
      checkins: boundedCheckins,
      userId,
      locale,
      planTier: plan,
      req,
    });
    if (response && typeof response === "object" && "__quotaExceeded" in response) {
      return quotaExceededResponse();
    }
    return NextResponse.json(response);
  } catch (error) {
    if (isCircuitOpenError(error)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[insights/generate] error", error);
    return serverErrorResponse();
  }
}

async function generateInsightsServerSide(body: AuthenticatedRequestPayload & { locale?: UILanguageCode; req: Request }): Promise<InsightResponse> {
  // Double-check bounds (belt-and-suspenders)
  const boundedCheckins = body.checkins.slice(0, CHECKIN_MAX_ROWS);

  const recentCheckins = [...boundedCheckins].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? ""),
  ) as DailyCheckIn[];
  const liteInsights = buildLiteInsights(recentCheckins);
  const emotionalShift = computeEmotionalShift(recentCheckins);

  // If no userId, return lite insights immediately (local-only mode)
  if (!body.userId) {
    return {
      insights: liteInsights,
      insight: liteInsights[0] ?? null,
      patterns: body.patterns ?? null,
      emotionalShift,
      tokensUsed: 0,
      mode: "lite",
    };
  }

  // Step 5: Estimate tokens and check availability (early 402)
  const estimatedTokens = estimateTokens("insights_generate");
  const tokenCheck = await checkTokenAvailability(body.userId ?? "", body.planTier, estimatedTokens, "insights_generate", "text");
  if (!tokenCheck.allowed) {
    return {
      insights: [],
      insight: null,
      patterns: body.patterns ?? null,
      emotionalShift,
      tokensUsed: 0,
      mode: "lite",
      __quotaExceeded: true,
    } as InsightResponse & { __quotaExceeded?: boolean };
  }

  if (!openai) {
    return {
      insights: liteInsights,
      insight: liteInsights[0] ?? null,
      patterns: body.patterns ?? null,
      emotionalShift,
      tokensUsed: 0,
      mode: "lite",
    };
  }

  // Step 6: ABORT-SAFE MONETISED OPERATION
  const userSettings = await loadServerVellaSettings(body.userId);
  const moodState = deriveMoodState(body.mood ?? recentCheckins[0]?.mood);
  const emotionalState = deriveEmotionalState(body, recentCheckins);
  const delivery = computeDeliveryHints({
    voiceId: userSettings.voiceModel,
    moodState,
    emotionalState,
  });
  const resolvedVoiceModel: VellaVoiceId =
    normalizeVellaVoiceId((body.voiceModel as string | null | undefined) ?? userSettings.voiceModel) ??
    DEFAULT_VELLA_VOICE_ID;
  const resolvedToneStyle: TonePreference =
    (body.toneStyle as TonePreference | null | undefined) ??
    userSettings.toneStyle ??
    userSettings.tone ??
    "soft";
  const resolvedRelationship: MemoryProfile["relationshipMode"] =
    (body.relationshipMode as MemoryProfile["relationshipMode"] | null | undefined) ??
    userSettings.relationshipMode ??
    "best_friend";
  const rawLocale = body.locale ?? resolveServerLocale();
  const locale = normalizeLocale(rawLocale) as UILanguageCode;
  const resolvedLanguage: SupportedLanguage =
    (body.language as SupportedLanguage | null | undefined) ?? (locale as SupportedLanguage) ?? FALLBACK_LANGUAGE;

  const personaInstruction = await buildPersonaInstruction({
    voiceId: resolvedVoiceModel,
    moodState,
    delivery,
    relationshipMode: resolvedRelationship,
    userSettings: {
      voiceModel: resolvedVoiceModel,
      tone: resolvedToneStyle,
      toneStyle: resolvedToneStyle,
      relationshipMode: resolvedRelationship,
      voiceHud: userSettings.voiceHud ?? DEFAULT_VOICE_HUD,
    },
    emotionalState,
    behaviourVector: (body.behaviourVector as BehaviourVector | null) ?? null,
    healthState: monitoringToHealthState(body.monitoring as { driftScore?: number; tensionLoad?: number; riskLevel?: number; fatigueLevel?: number; clarity?: number } | null),
    language: resolvedLanguage,
  });

  const prompt = buildInsightPrompt({
    checkins: recentCheckins,
    patterns: body.patterns as MemoryProfile["emotionalPatterns"],
    timezone: body.timezone,
    locale,
  });

  const result = await withMonetisedOperation(
    {
      userId: body.userId ?? "",
      plan: body.planTier ?? "free",
      estimatedTokens,
      operation: "insight_generation",
      route: "insights_generate",
      channel: "text",
      featureKey: "insights_generate",
      request: body.req,
    },
    async () => {
      const client = openai;
      if (!client) {
        throw new Error("openai_unavailable");
      }

      const completion = await runWithOpenAICircuit(() =>
        createChatCompletion({
          client,
          model,
          temperature: 0.35,
          max_tokens: 4096,
          timeoutMs: 60_000,
          messages: [
            {
              role: "system",
              content: `${personaInstruction}${locale !== "en" ? `\n\nCRITICAL: You MUST respond ONLY in ${locale.toUpperCase()}. DO NOT use English.` : ""}`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        })
      );

      const raw = completion.choices[0]?.message?.content?.trim();
      if (!raw) {
        throw new Error("empty_response");
      }

      const parsed = parseInsights(raw);
      const actualTokensUsed = completion.usage?.total_tokens ?? estimatedTokens;

      // Handle plain text fallback
      if (parsed && typeof parsed === "object" && "text" in parsed) {
        const textValue: string = String((parsed.text as string | null | undefined) ?? "");
        const fallbackInsight: InsightCardData = {
          id: "ai-insight-text",
          kind: "today",
          title: "Insight",
          body: textValue,
        };
        return {
          insights: [fallbackInsight],
          insight: fallbackInsight,
          patterns: body.patterns ?? null,
          emotionalShift,
          tokensUsed: 0,
          mode: "ai" as const,
        };
      }

      // Handle object with insights property
      const insightsArray = (parsed && typeof parsed === "object" && "insights" in parsed)
        ? (parsed.insights as unknown[])
        : Array.isArray(parsed)
        ? parsed
        : null;

      const insights =
        insightsArray && insightsArray.length
          ? insightsArray.map((insight: any, idx: number) => ({
              id: `ai-insight-${idx}`,
              kind: insight.moodTag ?? "today",
              title: insight.title ?? "",
              body: String(insight.body ?? ""),
              action: insight.action ?? null,
              moodTag: insight.moodTag,
            }))
          : liteInsights;

      return {
        insights,
        insight: insights[0] ?? null,
        patterns: body.patterns ?? null,
        emotionalShift,
        tokensUsed: 0,
          mode: (insightsArray && insightsArray.length ? "ai" : "lite") as "ai" | "lite",
      };
    }
  );

  if (!result.success) {
    // Return lite insights on failure (refund already handled by wrapper)
    safeErrorLog("[insights/generate] monetised operation failed", new Error(result.error));
    return {
      insights: liteInsights,
      insight: liteInsights[0] ?? null,
      patterns: body.patterns ?? null,
      emotionalShift,
      tokensUsed: 0,
      mode: "lite" as const,
    };
  }

  return result.data;
}

async function loadServerVellaSettings(userId: string | null) {
  if (!userId) {
    return DEFAULT_SETTINGS;
  }
  // Return defaults - localStorage not available server-side
  return DEFAULT_SETTINGS;
}

function deriveMoodState(mood?: number | null): MoodState {
  if (typeof mood !== "number") return "neutral";
  if (mood >= 7) return "uplifting";
  if (mood <= 3) return "grounding";
  return "neutral";
}

function deriveEmotionalState(
  body: RequestPayload,
  checkins: DailyCheckIn[],
) {
  const source = checkins[0];
  const valence = clamp(((source?.mood ?? body.mood ?? 5) - 5) / 5, -1, 1);
  const arousal = clamp(((body.energy ?? source?.energy ?? 5) / 10) || 0.5, 0, 1);
  const tension = clamp(((body.stress ?? source?.stress ?? 5) / 10) || 0.5, 0, 1);
  return createBaselineEmotionalState("best_friend", {
    valence,
    arousal,
    tension,
    warmth: clamp(((source?.focus ?? 5) / 10) || 0.5, 0, 1),
  });
}

function monitoringToHealthState(snapshot?: { driftScore?: number; tensionLoad?: number; riskLevel?: number; fatigueLevel?: number; clarity?: number } | null) {
  if (!snapshot) return undefined;
  return {
    driftScore: snapshot.driftScore ?? 0,
    tensionLoad: snapshot.tensionLoad ?? snapshot.riskLevel ?? 0,
    fatigue: snapshot.fatigueLevel ?? 0,
    clarity: snapshot.clarity ?? 0.5,
    lastUpdate: Date.now(),
  };
}

function computeEmotionalShift(checkins: DailyCheckIn[]): string | null {
  if (!checkins.length) return null;
  const recent = checkins.slice(0, 5);
  const avgMood =
    recent.reduce((sum, entry) => sum + (entry.mood ?? 5), 0) / recent.length;
  const latestMood = recent[0]?.mood ?? avgMood;
  const delta = latestMood - avgMood;
  if (Math.abs(delta) < 0.5) {
    return "Mood steady compared to recent average.";
  }
  return delta > 0 ? "Mood trending upward." : "Mood trending lower.";
}

function parseInsights(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    // Fall back to plain text mode
    return { text: raw };
  }
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
