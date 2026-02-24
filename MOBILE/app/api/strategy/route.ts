import { NextRequest, NextResponse } from "next/server";
import { runStoicStrategist } from "@/lib/ai/agents";
import { isCircuitOpenError } from "@/lib/ai/circuitBreaker";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { serviceUnavailableResponse, serverErrorResponse } from "@/lib/security/consistentErrors";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import type { ClaritySections } from "@/lib/ai/types";
import { getUserPlanTier } from "@/lib/tiers/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";

const ESTIMATED_TOKENS = 500;

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

export async function POST(req: NextRequest) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({ key: `strategy:${userId}`, limit: 3, window: 120 });

    const plan = await getUserPlanTier(userId).catch(() => "free" as const);
    const tokenCheck = await checkTokenAvailability(userId, plan, ESTIMATED_TOKENS, "strategy", "text");
    if (!tokenCheck.allowed) {
      return quotaExceededResponse();
    }

    const body = (await req.json().catch(() => null)) as { clarity?: Partial<ClaritySections> } | null;

    const clarity = normalizeClaritySections(body?.clarity);
    const result = await runStoicStrategist({ clarity }).catch(() => ({ error: "strategy_failed" as const }));
    if (result && "error" in result) {
      return serverErrorResponse();
    }
    if (result) {
      await chargeTokensForOperation(userId, plan, ESTIMATED_TOKENS, "strategy", "strategy", "text");
    }
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds);
    }
    if (isCircuitOpenError(err)) {
      return serviceUnavailableResponse();
    }
    safeErrorLog("[strategy] route error", err);
    return serverErrorResponse();
  }
}

const CLARITY_KEYS: (keyof ClaritySections)[] = [
  "facts",
  "unknowns",
  "assumptions",
  "biases",
  "contradictions",
  "questions",
];

function normalizeClaritySections(input?: Partial<ClaritySections> | null): ClaritySections {
  const base: ClaritySections = {
    facts: [],
    unknowns: [],
    assumptions: [],
    biases: [],
    contradictions: [],
    questions: [],
  };

  if (!input) {
    console.warn("[STRATEGY:DEGRADED] missing clarity payload; using empty sections");
    return base;
  }

  const missing: string[] = [];

  const normalizedEntries = CLARITY_KEYS.reduce((acc, key) => {
    const raw = input[key];
    if (!Array.isArray(raw)) {
      missing.push(key);
      acc[key] = [];
      return acc;
    }
    acc[key] = raw
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "")))
      .filter((value) => Boolean(value));
    return acc;
  }, base as Record<keyof ClaritySections, string[]>);

  if (missing.length) {
    console.warn(
      `[STRATEGY:DEGRADED] ClaritySections missing fields: ${missing.join(", ")}; substituting empty arrays`,
    );
  }

  return normalizedEntries as ClaritySections;
}

