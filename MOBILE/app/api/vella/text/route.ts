import { NextResponse } from "next/server";
import { buildVellaTextPrompt } from "@/lib/ai/textPrompts";
import { runVellaTextCompletion } from "@/lib/ai/textEngine";
import type { VellaMode } from "@/lib/ai/modes";
import { resolveMode } from "@/lib/ai/modeResolver";
import {
  getGovernanceStateForUser,
  isGovernanceStale,
  getRecentViolationCounts,
  getFocusSessionsCountLast7d,
  getActiveCommitmentsMetadata,
  getViolationAndCompletionCounts30d,
  getFocusSessionsCountLast30d,
  getPriorViolationTrendSnapshot,
} from "@/lib/governance/readState";
import { computeGovernanceState } from "@/lib/governance/stateEngine";
import { buildBehaviourSnapshot } from "@/lib/governance/behaviourSnapshot";
import { detectCommitmentContradiction } from "@/lib/governance/contradiction";
import { detectBoundarySignal } from "@/lib/safety/boundaryDetector";
import { recordEvent } from "@/lib/governance/events";
import { recordConversationMetadataV2 } from "@/lib/conversation/db";
import { retrieveTopK } from "@/lib/memory/retrieve";
import { formatMemoryContext } from "@/lib/memory/retrieve";
import {
  detectExerciseIntent,
  getBreathingExercise,
  getGroundingExercise,
  getMindfulnessExercise,
  getStressResetExercise,
} from "@/lib/vella/exercises";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response, getClientIp } from "@/lib/security/rateLimit";
import { checkTokenAvailability, chargeTokensForOperation } from "@/lib/tokens/enforceTokenLimits";
import { quotaExceededResponse } from "@/lib/tokens/quotaExceededResponse";
import { getUserPlanTier } from "@/lib/tiers/server";
import { vellaTextRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { buildObservabilityMeta, logSecurityEvent } from "@/lib/security/observability";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import { SafeDataError, serverTextStorageBlockedResponse } from "@/lib/safe/safeSupabaseWrite";
import { filterUnsafeContent } from "@/lib/safety/complianceFilter";
import { z } from "zod";
import { buildFocusInterventionMessage } from "@/lib/focus/interventions";
import { buildConversationContext, formatConversationForPrompt } from "@/lib/llm/contextBuilder";

/**
 * Economic guardrails for /api/vella/text:
 * - Authentication: requireUserId() — no OpenAI call without a valid session.
 * - Per-user rate limit: 5 requests / 60s to prevent burst abuse.
 * - Request validation: Zod schema (message 1–4000 chars, language optional max 10); reject unknown fields.
 * - Token quota: checkTokenAvailability before any OpenAI call; return 402 if over quota.
 * - Token charging: chargeTokensForOperation after successful completion only.
 * - Oversized messages are rejected at validation (400); no OpenAI call is made.
 */

const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_SEC = 60;

/** Conservative token estimate: input (message + prompt template) + output (max 500). ~4 chars/token + buffer. */
function estimateTokensForMessage(messageLength: number): number {
  const inputTokens = Math.ceil(messageLength / 4) + 500; // message + template
  const outputTokens = 500;
  return inputTokens + outputTokens;
}

function buildExerciseReply(message: string): string | null {
  const exerciseType = detectExerciseIntent(message);
  if (!exerciseType) return null;

  // Optional short lead-in so Vella feels responsive to the user,
  // but the heavy lifting comes from the scripted exercise text.
  let script: string;

  switch (exerciseType) {
    case "breathing":
      script =
        "Okay, let's slow everything down together with a short breathing exercise.\n\n" +
        getBreathingExercise();
      break;
    case "grounding":
      script =
        "You're not alone in this. Let's try a quick grounding exercise to bring you back into your body.\n\n" +
        getGroundingExercise();
      break;
    case "mindfulness":
      script =
        "I can guide you through a short mindfulness reset so your mind can settle a bit.\n\n" +
        getMindfulnessExercise();
      break;
    case "stressReset":
      script =
        "I hear that things feel heavy right now. Let's walk through a short reset to reduce the pressure.\n\n" +
        getStressResetExercise();
      break;
    default:
      return null;
  }

  return script.trim();
}

const ROUTE_NAME = "vella/text";

const AI_DISABLED_RESPONSE = { error: "ai_unavailable", message: "AI is temporarily disabled" };

export async function POST(req: Request) {
  if (isAIDisabled()) {
    return NextResponse.json(AI_DISABLED_RESPONSE, { status: 503 });
  }
  const requestId = crypto.randomUUID();
  const startMs = Date.now();
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;
  const ip = getClientIp(req);
  const obsMeta = () => buildObservabilityMeta(requestId, ROUTE_NAME, startMs, { userId, ip });

  try {
    await rateLimit({
      key: `vella_text:${userId}`,
      limit: RATE_LIMIT_REQUESTS,
      window: RATE_LIMIT_WINDOW_SEC,
    });
  } catch (err: unknown) {
    if (isRateLimitError(err)) {
      return rateLimit429Response(err.retryAfterSeconds, obsMeta());
    }
    throw err;
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return validationErrorResponse("Invalid JSON body", obsMeta());
  }

  let text: string;
  let rawLanguage: string | undefined;
  let sessionId: string | undefined | null;
  let requestedMode: string | null | undefined;
  let activeValues: string[] | undefined;
  let conversationHistory: { role: "user" | "assistant"; content: string }[] | undefined;

  const focusInterventionSchema = z
    .object({
      type: z.literal("focus_intervention"),
      subjectCode: z.string().min(1).max(50),
      weekId: z.string(),
      rating: z.number().min(0).max(2),
    })
    .strict();

  const focusParse = focusInterventionSchema.safeParse(json);
  if (focusParse.success) {
    const { subjectCode } = focusParse.data;
    text = buildFocusInterventionMessage(subjectCode);
    rawLanguage = "en";
    sessionId = undefined;
    requestedMode = null;
    activeValues = undefined;
    conversationHistory = undefined;
  } else {
    const parseResult = vellaTextRequestSchema.safeParse(json);
    if (!parseResult.success) {
      return validationErrorResponse(formatZodError(parseResult.error), obsMeta());
    }
    const parsed = parseResult.data;
    text = parsed.message;
    rawLanguage = parsed.language;
    sessionId = parsed.session_id;
    requestedMode = parsed.mode;
    activeValues = parsed.activeValues;
    conversationHistory = parsed.conversationHistory;
  }

  const limitedHistory = conversationHistory
    ? buildConversationContext(conversationHistory)
    : [];
  const conversationContext =
    limitedHistory.length > 0 ? formatConversationForPrompt(limitedHistory) : undefined;

  const language = rawLanguage ?? "en";

  let governance = await getGovernanceStateForUser(userId);
  if (isGovernanceStale(governance)) {
    await computeGovernanceState(userId).catch(() => {});
    governance = await getGovernanceStateForUser(userId);
  }
  let finalMode = resolveMode((requestedMode ?? null) as VellaMode | null, governance);

  try {
  // Short-circuit for guided exercises (no OpenAI call — no quota check or charge).
  const exerciseReply = buildExerciseReply(text);
  if (exerciseReply) {
    const safeExerciseReply = await filterUnsafeContent(exerciseReply);
    await recordConversationMetadataV2({ userId, messageCount: 2, tokenCount: 0, mode_enum: finalMode });
    return NextResponse.json(
      {
        reply: safeExerciseReply,
        resultType: "guided_exercise",
        emotionIntel: null,
        sessionState: null,
        preferredLanguage: language,
        audioMode: null,
        audioReason: null,
        audioDirective: null,
        audioCommentary: null,
      },
      { status: 200 }
    );
  }

  const plan = await getUserPlanTier(userId).catch(() => "free" as const);
  const estimatedTokens = estimateTokensForMessage(text.length);
  const tokenCheck = await checkTokenAvailability(userId, plan, estimatedTokens, "vella_text", "text");
  if (!tokenCheck.allowed) {
    return quotaExceededResponse(obsMeta());
  }

  const paid = plan === "pro" || plan === "elite";
  const memoryBlocks = await retrieveTopK({
    userId,
    queryText: text,
    k: 6,
    maxCharsTotal: 1200,
  }).catch(() => []);
  const memoryContext = memoryBlocks.length > 0 ? formatMemoryContext(memoryBlocks, paid) : "";

  const [violationCounts, focusSessionsLast7d, activeCommitments, counts30d, focus30d, priorTrend] = await Promise.all([
    getRecentViolationCounts(userId),
    getFocusSessionsCountLast7d(userId),
    getActiveCommitmentsMetadata(userId),
    getViolationAndCompletionCounts30d(userId),
    getFocusSessionsCountLast30d(userId),
    getPriorViolationTrendSnapshot(userId),
  ]);
  const contradiction = detectCommitmentContradiction(text, activeCommitments);
  const boundarySignal = detectBoundarySignal(text);
  const longitudinalInput = {
    violationCounts30d: {
      commitmentViolations30d: counts30d.commitmentViolations30d,
      abstinenceViolations30d: counts30d.abstinenceViolations30d,
    },
    completionCounts30d: { commitmentCompleted30d: counts30d.commitmentCompleted30d },
    focusSessions30d: focus30d,
    priorTrendSnapshot: priorTrend.length > 0 ? priorTrend : undefined,
  };
  const behaviourSnapshot = buildBehaviourSnapshot(
    governance,
    violationCounts,
    focusSessionsLast7d,
    contradiction,
    {
      boundaryTriggered: boundarySignal.boundaryTriggered,
      boundaryType: boundarySignal.boundaryType,
      boundarySeverity: boundarySignal.severity,
    },
    longitudinalInput,
    activeValues ?? null
  );
  finalMode = resolveMode((requestedMode ?? null) as VellaMode | null, governance, {
    contradictionDetected: behaviourSnapshot.contradictionDetected,
    boundarySeverity: boundarySignal.severity,
    firmnessLevel: behaviourSnapshot.guidanceSignals?.firmnessLevel,
  });

  const prompt = buildVellaTextPrompt({
    userMessage: text,
    language,
    memoryContext: memoryContext || undefined,
    behaviourSnapshot,
    conversationContext: conversationContext || undefined,
  });

  let reply: string;
  try {
    reply = await runVellaTextCompletion(prompt, userId, { mode: finalMode });
  } catch (err) {
    safeErrorLog("[Vella Text Endpoint] Error", err);
    return NextResponse.json(
      {
        reply: "I'm here, but I'm having trouble processing that right now. Can you try again?",
        resultType: "text",
        emotionIntel: null,
        sessionState: null,
      },
      { status: 200 }
    );
  }

  const safeReply = await filterUnsafeContent(reply);

  if (finalMode === "crisis") {
    try {
      await recordEvent(userId, "scheduler_tick", undefined, governance.escalationLevel, {
        escalation_level: governance.escalationLevel,
        risk_score: governance.riskScore,
      });
    } catch {
      logSecurityEvent({
        ...obsMeta(),
        outcome: "crisis_event_write_failed",
      });
    }
  }

  await chargeTokensForOperation(userId, plan, estimatedTokens, "vella_text", "vella_text", "text");

  await recordConversationMetadataV2({
    userId,
    messageCount: 2,
    tokenCount: estimatedTokens,
    modelId: "vella_text",
    mode_enum: finalMode,
  });

  logSecurityEvent({ ...obsMeta(), outcome: "ok" });
  return NextResponse.json(
    {
      reply: safeReply,
      resultType: "text",
      emotionIntel: null,
      sessionState: null,
    },
    { status: 200 }
  );
  } catch (err) {
    if (err instanceof SafeDataError && err.code === "WRITE_BLOCKED_TABLE") {
      return serverTextStorageBlockedResponse(requestId);
    }
    throw err;
  }
}

