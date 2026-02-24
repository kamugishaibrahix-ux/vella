"use client";

import type { DailyCheckIn, MemoryProfile } from "@/lib/memory/types";
import type { PlanTier } from "@/lib/tiers/tierCheck";

type PatternResponse = {
  patterns?: MemoryProfile["emotionalPatterns"];
  mode?: "ai" | "lite";
  fallbackReason?: string;
};

const EMPTY_PATTERNS: MemoryProfile["emotionalPatterns"] = {
  commonPrimaryEmotions: [],
  commonTriggers: [],
  commonFears: [],
  emotionalTendencies: [],
};

const EMPTY_RESPONSE = createResponse(EMPTY_PATTERNS, "lite", "client_error");

export type PatternRequestPayload = {
  userId: string | null;
  planTier: PlanTier;
  checkins: DailyCheckIn[];
  voiceModel?: string | null;
  relationshipMode?: string | null;
  toneStyle?: string | null;
  language?: string | null;
  locale?: string;
};

export type PatternClientResult = MemoryProfile["emotionalPatterns"] & {
  patterns: MemoryProfile["emotionalPatterns"];
  mode: "ai" | "lite";
  fallbackReason?: string;
};

export async function requestEmotionalPatterns(
  payload: PatternRequestPayload,
): Promise<PatternClientResult> {
  // silent fallback
  try {
    const response = await fetch("/api/insights/patterns", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(payload.locale ? { "Accept-Language": payload.locale } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const result = createResponse(EMPTY_PATTERNS, "lite", "client-error");
      // silent fallback
      return result;
    }

    let data: PatternResponse;
    try {
      data = (await response.json()) as PatternResponse;
    } catch (error) {
      // silent fallback
      const result = createResponse(EMPTY_PATTERNS, "lite", "invalid-json");
      // silent fallback
      return result;
    }

    const result = createResponse(
      data.patterns ?? EMPTY_PATTERNS,
      data.mode ?? "ai",
      data.fallbackReason,
    );
    // silent fallback
    return result;
  } catch (error) {
    // silent fallback
    const result = createResponse(EMPTY_PATTERNS, "lite", "client-error");
    // silent fallback
    return result;
  }
}

function createResponse(
  patterns: MemoryProfile["emotionalPatterns"],
  mode: "ai" | "lite",
  fallbackReason?: string,
): PatternClientResult {
  return Object.assign({}, patterns, {
    patterns,
    mode,
    fallbackReason,
  });
}

