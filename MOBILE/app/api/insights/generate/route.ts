import { NextResponse } from "next/server";
import { openai, model } from "@/lib/ai/client";
import { runWithOpenAICircuit, isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
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
import { getUpgradeBlock } from "@/lib/tiers/tierCheck";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import type { MonitoringSnapshot } from "@/lib/monitor/types";
import type { HealthState } from "@/lib/realtime/health/state";
import type { VellaSettings } from "@/lib/settings/vellaSettings";
import type { RelationshipMode } from "@/lib/realtime/emotion/state";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { loadLocal } from "@/lib/local/storage";
import { resolveServerLocale, normalizeLocale } from "@/i18n/serverLocale";
import type { UILanguageCode } from "@/i18n/types";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { requireUserId } from "@/lib/supabase/server-auth";
import { insightsGenerateRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

const FEATURE_KEY = "insight";
const DEFAULT_VOICE_HUD: VellaSettings["voiceHud"] = {
  moodChip: true,
  stability: true,
  deliveryHints: true,
  sessionTime: true,
  tokenChip: true,
  strategyChip: true,
  alertChip: true,
};

type RequestPayload = ReturnType<typeof insightsGenerateRequestSchema.parse>;
type AuthenticatedRequestPayload = Omit<RequestPayload, "userId"> & { userId: string | null; locale?: UILanguageCode };

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

export async function POST(req: Request) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    const { limit, window } = RATE_LIMIT_CONFIG.routes.insights_generate;
    await rateLimit({ key: `insights_generate:${userId}`, limit, window });

    const json = await req.json();
    const parseResult = insightsGenerateRequestSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const body = parseResult.data;
    const rawLocale = (body.locale as string) || resolveServerLocale();
    const locale = normalizeLocale(rawLocale) as UILanguageCode;
    console.log("🌐 API /insights/generate - Detected locale:", locale, "(raw:", rawLocale, ")");

    const localCheckins = await getAllCheckIns(userId).catch(() => []);
    void localCheckins;

    const { userId: _ignored, ...rest } = body;
    const response = await generateInsightsServerSide({ ...rest, userId, locale });
    if (response && typeof response === "object" && "__quotaExceeded" in response) {
      return quotaExceededResponse();
    }
    return NextResponse.json(response);
  } catch (error) {
    if (isRateLimitError(error)) {
      return rateLimit429Response(error.retryAfterSeconds);
    }
    if (isCircuitOpenError(error)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[insights/generate] error", error);
    return serverErrorResponse();
  }
}

async function generateInsightsServerSide(body: AuthenticatedRequestPayload & { locale?: UILanguageCode }): Promise<InsightResponse> {
  const recentCheckins = [...body.checkins].sort((a, b) =>
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

  const estimatedTokens = 3000;
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

  const upgradeBlock = getUpgradeBlock(body.planTier, FEATURE_KEY);
  if (upgradeBlock) {
    return {
      insights: [
        {
          id: "insight-upgrade",
          kind: "upgrade",
          title: "Unlock deeper insights",
          body: upgradeBlock,
          action: "Visit Account & Plan to upgrade",
        },
      ],
      insight: null,
      patterns: body.patterns ?? null,
      emotionalShift,
      tokensUsed: 0,
      mode: "lite",
    };
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

  try {
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
    const resolvedRelationship: RelationshipMode =
      (body.relationshipMode as RelationshipMode | null | undefined) ??
      userSettings.relationshipMode ??
      "best_friend";
    const rawLocale = body.locale ?? resolveServerLocale();
    const locale = normalizeLocale(rawLocale) as UILanguageCode;
    console.log("🌐 API /insights/generate - Detected locale:", locale, "(raw:", rawLocale, ")");
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
      healthState: monitoringToHealthState(body.monitoring as MonitoringSnapshot | null),
      language: resolvedLanguage,
    });

    const prompt = buildInsightPrompt({
      checkins: recentCheckins,
      patterns: body.patterns as MemoryProfile["emotionalPatterns"],
      timezone: body.timezone,
      locale,
    });

    try {
      const tokenCost = 0;

      const client = openai;
      const completion = await runWithOpenAICircuit(() =>
        client!.chat.completions.create({
          model,
          temperature: 0.35,
          messages: [
            {
              role: "system",
              content: `${personaInstruction}${locale !== "en" ? `\n\n🚨 CRITICAL: You MUST respond ONLY in ${locale.toUpperCase()}. DO NOT use English.` : ""}`,
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
        return {
          insights: liteInsights,
          insight: liteInsights[0] ?? null,
          patterns: body.patterns ?? null,
          emotionalShift,
          tokensUsed: tokenCost,
          mode: "lite",
        };
      }

      const parsed = parseInsights(raw);
      
      const actualTokensUsed = completion.usage?.total_tokens ?? estimatedTokens;
      await chargeTokensForOperation(
        body.userId ?? "",
        body.planTier,
        actualTokensUsed,
        "insight_generation",
        "insights_generate",
        "text",
      );
      
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
          tokensUsed: tokenCost,
          mode: "ai",
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
          ? insightsArray.map((insight: any, idx) => ({
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
        tokensUsed: tokenCost,
        mode: insightsArray && insightsArray.length ? "ai" : "lite",
      };
    } catch (err) {
      safeErrorLog("[insights/generate] generation error", err);
      return {
        insights: liteInsights,
        insight: liteInsights[0] ?? null,
        patterns: body.patterns ?? null,
        emotionalShift,
        tokensUsed: 0,
        mode: "lite",
      };
    }
  } catch (error) {
    safeErrorLog("[api] insights/generate premium path failed", error);
    return {
      insights: liteInsights,
      insight: liteInsights[0] ?? null,
      patterns: body.patterns ?? null,
      emotionalShift,
      tokensUsed: 0,
      mode: "lite",
    };
  }
}

async function loadServerVellaSettings(userId: string | null) {
  if (!userId) {
    return DEFAULT_SETTINGS;
  }
  // Local-first: load from localStorage
  try {
    const settings = loadLocal<VellaSettings>(`vella_settings:${userId}`);
    if (!settings) {
      return DEFAULT_SETTINGS;
    }
    return {
      voiceModel: normalizeVellaVoiceId(settings.voiceModel) ?? DEFAULT_VELLA_VOICE_ID,
      tone: settings.tone ?? DEFAULT_SETTINGS.tone,
      toneStyle: settings.toneStyle ?? DEFAULT_SETTINGS.toneStyle,
      relationshipMode: settings.relationshipMode ?? DEFAULT_SETTINGS.relationshipMode,
      voiceHud: settings.voiceHud ?? DEFAULT_VOICE_HUD,
    };
  } catch (error) {
    safeErrorLog("[insights/generate] loadServerVellaSettings error", error);
    return DEFAULT_SETTINGS;
  }
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

function monitoringToHealthState(snapshot?: MonitoringSnapshot | null): HealthState | undefined {
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

