import { NextResponse } from "next/server";
import { openai, model } from "@/lib/ai/client";
import { runWithOpenAICircuit, isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { createChatCompletion } from "@/lib/ai/safeOpenAI";
import { rateLimit, rateLimit429Response, rateLimit503Response } from "@/lib/security/rateLimit";
import { RATE_LIMIT_CONFIG } from "@/lib/security/rateLimit/config";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { buildPersonaInstruction } from "@/lib/realtime/personaSynth";
import {
  computeDeliveryHints,
  type MoodState,
} from "@/lib/realtime/deliveryEngine";
import {
  DEFAULT_VELLA_VOICE_ID,
  normalizeVellaVoiceId,
  type VellaVoiceId,
} from "@/lib/voice/vellaVoices";
import type { DailyCheckIn, MemoryProfile, TonePreference } from "@/lib/memory/types";
import type { RelationshipMode } from "@/lib/realtime/emotion/state";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import { resolveServerLocale, normalizeLocale } from "@/i18n/serverLocale";
import type { UILanguageCode } from "@/i18n/types";
import { checkTokenAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { insightsPatternRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import { applyCheckinBounds, CHECKIN_MAX_ROWS } from "@/lib/insights/checkinBounds";
type PatternSchema = ReturnType<typeof insightsPatternRequestSchema.parse>;
import type { PlanTier } from "@/lib/tiers/tierCheck";

type PatternInput = Omit<PatternSchema, "userId"> & { locale?: UILanguageCode; planTier?: PlanTier };

type NormalizedCheckin = Pick<DailyCheckIn, "mood" | "stress" | "energy" | "note"> & {
  id?: string;
  date?: string;
  createdAt?: string;
  focus?: number | null;
};

function normalizeCheckins(checkins: PatternSchema["checkins"]): NormalizedCheckin[] {
  return checkins.map((entry) => ({
    id: entry.id,
    date: entry.date ?? entry.createdAt,
    createdAt: entry.createdAt ?? entry.date,
    mood: entry.mood ?? 0,
    stress: entry.stress ?? 0,
    energy: entry.energy ?? 0,
    note: entry.note ?? "",
    focus: entry.focus ?? 0,
  }));
}

type PatternResult = {
  patterns: MemoryProfile["emotionalPatterns"];
  mode: "ai" | "lite";
  fallbackReason?: string;
};

const EMPTY_PATTERNS: MemoryProfile["emotionalPatterns"] = {
  commonPrimaryEmotions: [],
  commonTriggers: [],
  commonFears: [],
  emotionalTendencies: [],
};

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal text IN MEMORY ONLY.
 * - Derives emotional patterns via OpenAI
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
  // Step 1+2: Require entitlement (includes active user check + enableInsightsPatterns gating)
  const entitlement = await requireEntitlement("insights_patterns");
  if (isEntitlementBlocked(entitlement)) return entitlement;
  const { userId, plan } = entitlement;

  // Step 3: Rate limit (must be before token operations)
  const { limit, window } = RATE_LIMIT_CONFIG.routes.insights_patterns;
  const rateLimitResult = await rateLimit({
    key: `insights_patterns:${userId}`,
    limit,
    window,
    routeKey: "insights_patterns",
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
    const parseResult = insightsPatternRequestSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error));
    }

    const body = parseResult.data;
    const rawLocale = (body.locale as string) || resolveServerLocale();
    const locale = normalizeLocale(rawLocale) as UILanguageCode;

    // Apply deterministic bounds to incoming check-ins
    const boundedCheckins = applyCheckinBounds((body.checkins ?? []) as DailyCheckIn[]);

    const { userId: _ignored, planTier: _ignoredPlan, checkins: _ignoredCheckins, ...safeBody } = body;
    const result = await derivePatternsForRequest(userId, {
      ...safeBody,
      checkins: boundedCheckins,
      locale,
      planTier: plan,
    });
    if (result && typeof result === "object" && "__quotaExceeded" in result) {
      return quotaExceededResponse();
    }
    return NextResponse.json(result satisfies PatternResult);
  } catch (error) {
    if (isCircuitOpenError(error)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[api] insights/patterns error", error);
    return serverErrorResponse();
  }
}

async function derivePatternsForRequest(userId: string, body: PatternInput): Promise<PatternResult> {
  if (!body.checkins.length) {
    return wrapLite(EMPTY_PATTERNS, "no_checkins");
  }

  // Double-check bounds (belt-and-suspenders)
  const boundedCheckins = body.checkins.slice(0, CHECKIN_MAX_ROWS);

  if (!openai) {
    return wrapLite(computeLitePatterns(normalizeCheckins(boundedCheckins)), "missing_auth");
  }

  const normalizedCheckins = normalizeCheckins(boundedCheckins);

  const estimatedTokens = 2500;
  const planTier = body.planTier ?? "free";

  // Step 5: Check token availability (early 402)
  const tokenCheck = await checkTokenAvailability(userId, planTier, estimatedTokens, "insights_patterns", "text");
  if (!tokenCheck.allowed) {
    return { __quotaExceeded: true } as unknown as PatternResult;
  }

  // Step 6: ABORT-SAFE MONETISED OPERATION
  const personaInstruction = await buildPatternPersonaInstruction(body);

  const result = await withMonetisedOperation(
    {
      userId,
      plan: planTier,
      estimatedTokens,
      operation: "pattern_analysis",
      route: "insights_patterns",
      channel: "text",
      featureKey: "insights_patterns",
      request: new Request("http://localhost"), // Dummy request for wrapper compatibility
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
          temperature: 0.2,
          max_tokens: 4096,
          timeoutMs: 60_000,
          messages: [
            {
              role: "system",
              content: `${personaInstruction}\nYou are Vella's emotional pattern engine. Analyse recent check-ins and return JSON describing ${JSON.stringify(
                Object.keys(EMPTY_PATTERNS),
              )}.${body.locale && body.locale !== "en" ? `\n\nCRITICAL: You MUST respond ONLY in ${body.locale.toUpperCase()}. DO NOT use English.` : ""}`,
            },
            { role: "user", content: buildPrompt(normalizedCheckins, body.locale ?? "en") },
          ],
        })
      );

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("empty_response");
      }

      let parsed: MemoryProfile["emotionalPatterns"] | null = null;
      try {
        const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
        const json = JSON.parse(cleaned) as Partial<MemoryProfile["emotionalPatterns"]>;
        parsed = {
          commonPrimaryEmotions: normaliseArray(json?.commonPrimaryEmotions),
          commonTriggers: normaliseArray(json?.commonTriggers),
          commonFears: normaliseArray(json?.commonFears),
          emotionalTendencies: normaliseArray(json?.emotionalTendencies),
        };
      } catch (error) {
        safeErrorLog("[api] insights/patterns parse error", error);
        throw new Error("parse_error");
      }

      if (!parsed) {
        throw new Error("invalid_response");
      }

      return {
        patterns: parsed,
        mode: "ai" as const,
      };
    }
  );

  if (!result.success) {
    // Return lite patterns on failure (refund already handled by wrapper)
    safeErrorLog("[insights/patterns] monetised operation failed", new Error(result.error));
    return wrapLite(computeLitePatterns(normalizedCheckins), "ai_failed");
  }

  return result.data;
}

function buildPrompt(checkins: NormalizedCheckin[], locale: UILanguageCode = "en") {
  // Normalize locale to 2-letter format
  const normalizedLocale = locale?.slice(0, 2).toLowerCase() || "en";

  const condensed = checkins.slice(0, 20).map((entry) => ({
    date: entry.date ?? entry.createdAt,
    mood: entry.mood,
    stress: entry.stress,
    focus: entry.focus,
    energy: entry.energy,
    note: entry.note,
  }));

  const languageInstruction = normalizedLocale !== "en"
    ? `
\nCRITICAL LANGUAGE REQUIREMENT
You MUST respond ONLY in ${normalizedLocale.toUpperCase()}.
DO NOT use English unless ${normalizedLocale} is 'en'.
All text in patterns (emotions, triggers, fears, tendencies) MUST be in ${normalizedLocale}.
If you use English when ${normalizedLocale} is not 'en', the response will be invalid.\n\n`
    : "";

  return `${languageInstruction}Use the following check-in data to infer emotional patterns.\nReturn JSON with shape:\n${JSON.stringify(
    EMPTY_PATTERNS,
  )}\nCheck-ins:${JSON.stringify(condensed)}`;
}

function computeLitePatterns(checkins: Pick<DailyCheckIn, "mood" | "stress" | "energy" | "note">[]) {
  if (checkins.length === 0) return EMPTY_PATTERNS;

  const moods = checkins.map((c) => c.mood ?? 0);
  const stresses = checkins.map((c) => c.stress ?? 0);
  const avgMood = average(moods);
  const avgStress = average(stresses);

  const noteBlob = checkins
    .map((c) => (c.note ?? "").toLowerCase())
    .filter(Boolean)
    .join(" ");

  const primary: string[] = [];
  if (avgMood <= 3) primary.push("sadness");
  else if (avgMood <= 6) primary.push("mixed emotions");
  else primary.push("hopefulness");
  if (avgStress >= 6) primary.push("overwhelm");

  const triggers: string[] = [];
  if (noteBlob.includes("work")) triggers.push("workload");
  if (noteBlob.includes("family")) triggers.push("family tension");
  if (noteBlob.includes("relationship")) triggers.push("relationship uncertainty");
  if (noteBlob.includes("health")) triggers.push("health worries");
  if (!triggers.length) triggers.push(avgStress >= 6 ? "pressure to deliver" : "daily demands");

  const fears: string[] = [];
  if (noteBlob.includes("failure")) fears.push("fear of failing expectations");
  if (noteBlob.includes("alone") || noteBlob.includes("lonely")) fears.push("fear of disconnection");
  if (!fears.length) fears.push(avgMood <= 4 ? "fear of losing momentum" : "fear of letting others down");

  const tendencies: string[] = [];
  if (avgStress >= 6) tendencies.push("carrying tension for long stretches");
  if (avgMood <= 4) tendencies.push("internalising difficult emotions");
  if (avgMood >= 6) tendencies.push("recovering faster after dips");

  return {
    commonPrimaryEmotions: dedupe(primary),
    commonTriggers: dedupe(triggers),
    commonFears: dedupe(fears),
    emotionalTendencies: dedupe(tendencies),
  };
}

async function buildPatternPersonaInstruction(body: PatternInput) {
  const voiceId: VellaVoiceId =
    normalizeVellaVoiceId((body.voiceModel as string | null | undefined) ?? undefined) ??
    DEFAULT_VELLA_VOICE_ID;
  const moodState = resolveMoodState(body);
  const delivery = computeDeliveryHints({
    voiceId,
    moodState,
  });
  const toneStyle: TonePreference =
    (body.toneStyle as TonePreference | null | undefined) ?? "soft";
  const relationshipMode: RelationshipMode =
    (body.relationshipMode as RelationshipMode | null | undefined) ?? "best_friend";
  const locale = body.locale ?? "en";
  const language: SupportedLanguage =
    (body.language as SupportedLanguage | null | undefined) ?? (locale as SupportedLanguage) ?? "en";

  return await buildPersonaInstruction({
    voiceId,
    moodState,
    delivery,
    relationshipMode,
    userSettings: {
      voiceModel: voiceId,
      tone: toneStyle,
      toneStyle,
      relationshipMode,
      voiceHud: {
        moodChip: true,
        stability: true,
        deliveryHints: true,
        sessionTime: true,
        tokenChip: true,
        strategyChip: true,
        alertChip: true,
      },
    },
    language,
  });
}

function resolveMoodState(body: PatternInput): MoodState {
  const averageStress =
    body.checkins.reduce((sum, entry) => sum + (entry.stress ?? 0), 0) / body.checkins.length;
  if (averageStress >= 7) {
    return "grounding";
  }
  const averageMood = body.checkins.reduce((sum, entry) => sum + (entry.mood ?? 0), 0) / body.checkins.length;
  if (averageMood >= 7) return "uplifting";
  if (averageMood <= 3) return "soothing";
  return "neutral";
}

function average(values: number[]) {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normaliseArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 5);
}

function wrapLite(
  patterns: MemoryProfile["emotionalPatterns"],
  fallbackReason?: string,
): PatternResult {
  return {
    patterns,
    mode: "lite",
    fallbackReason,
  };
}
