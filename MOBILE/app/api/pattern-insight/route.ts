import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDictionary, supportedLanguages, type UILanguageCode } from "@/i18n/config";
import { rateLimit, getClientIp, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { safeErrorLog } from "@/lib/security/logGuard";

function interpolateString(template: string, params: Record<string, string>): string {
  let result = template;
  Object.entries(params).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  });
  return result;
}

const patternBucketsSchema = z
  .object({
    commonPrimaryEmotions: z.array(z.string()).optional(),
    commonTriggers: z.array(z.string()).optional(),
    commonFears: z.array(z.string()).optional(),
  })
  .passthrough();

const requestSchema = z.object({
  patterns: z.union([z.array(z.string()), patternBucketsSchema]),
  language: z.string().optional(),
});

type PatternBuckets = {
  commonPrimaryEmotions: string[];
  commonTriggers: string[];
  commonFears: string[];
};

function normalizePatterns(
  patterns: z.infer<typeof requestSchema>["patterns"],
): PatternBuckets {
  const clean = (values: string[] | undefined) =>
    (values ?? []).map((value) => value.trim()).filter(Boolean);

  if (Array.isArray(patterns)) {
    return {
      commonPrimaryEmotions: clean(patterns),
      commonTriggers: [],
      commonFears: [],
    };
  }

  return {
    commonPrimaryEmotions: clean(patterns.commonPrimaryEmotions),
    commonTriggers: clean(patterns.commonTriggers),
    commonFears: clean(patterns.commonFears),
  };
}

const SUPPORTED_LANG_SET = new Set<UILanguageCode>(supportedLanguages);

function resolveLanguage(candidate?: string | null): UILanguageCode {
  const normalized = candidate?.toLowerCase() ?? "en";
  return SUPPORTED_LANG_SET.has(normalized as UILanguageCode)
    ? (normalized as UILanguageCode)
    : "en";
}

function invalidRequestResponse() {
  return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
}

/** Read-only tier (public): 60 req/60s per IP */
const READ_LIMIT = { limit: 60, window: 60 };

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimit({ key: `ip:pattern_insight:${ip}`, limit: READ_LIMIT.limit, window: READ_LIMIT.window });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return invalidRequestResponse();
  }

  const candidateBody =
    rawBody && typeof rawBody === "object"
      ? {
          ...(rawBody as Record<string, unknown>),
          language:
            (rawBody as Record<string, unknown>).language ??
            (rawBody as Record<string, unknown>).userLanguage,
        }
      : null;

  const parseResult = requestSchema.safeParse(candidateBody ?? {});

  if (!parseResult.success) {
    return invalidRequestResponse();
  }

  const { patterns: rawPatterns, language } = parseResult.data;
  const normalizedPatterns = normalizePatterns(rawPatterns);
  const targetLanguage = resolveLanguage(language);

  try {
    const dictionary = await getDictionary(targetLanguage);

    const parts: string[] = [];

    if (normalizedPatterns.commonPrimaryEmotions.length > 0) {
      const emotionsStr = normalizedPatterns.commonPrimaryEmotions.join(", ");
      parts.push(
        interpolateString(dictionary["patterns.insight.emotions"], { emotions: emotionsStr }),
      );
    }

    if (normalizedPatterns.commonTriggers.length > 0) {
      const triggersStr = normalizedPatterns.commonTriggers.join(", ");
      parts.push(
        interpolateString(dictionary["patterns.insight.triggers"], { triggers: triggersStr }),
      );
    }

    if (normalizedPatterns.commonFears.length > 0) {
      const fearsStr = normalizedPatterns.commonFears.join(", ");
      parts.push(
        interpolateString(dictionary["patterns.insight.fears"], { fears: fearsStr }),
      );
    }

    if (parts.length === 0) {
      const fallbackDictionary =
        targetLanguage === "en" ? dictionary : await getDictionary("en");
      return NextResponse.json({
        insight: fallbackDictionary["patterns.insight.noPatterns"],
      });
    }

    return NextResponse.json({
      insight: parts.join(" "),
    });
  } catch (err) {
    safeErrorLog("[pattern-insight] error", err);
    const dictionary = await getDictionary("en");
    return NextResponse.json(
      { insight: dictionary["patterns.insight.learning"] },
      { status: 500 },
    );
  }
}

