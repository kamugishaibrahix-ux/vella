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
import { retrieveTopK, buildCompleteMemoryContext } from "@/lib/memory/retrieve";
import {
  detectExerciseIntent,
  getBreathingExercise,
  getGroundingExercise,
  getMindfulnessExercise,
  getStressResetExercise,
} from "@/lib/vella/exercises";
import { requireEntitlement, isEntitlementBlocked } from "@/lib/plans/requireEntitlement";
import { rateLimit, rateLimit429Response, getClientIp } from "@/lib/security/rateLimit";
import { checkCreditAvailability } from "@/lib/tokens/enforceTokenLimits";
import { withMonetisedOperation } from "@/lib/tokens/withMonetisedOperation";
import { routeIntentWithTrace, logRouterDecision } from "@/lib/intent/router";
import { getCreditCost, CREDIT_OUTPUT_CAP, MEMORY_CHAR_CAP } from "@/lib/billing/creditCostTable";
import { createTrace, finalizeTrace, buildDebugPayload, traceHeaders, isDebugEnabled, type VellaTrace } from "@/lib/observability/vellaTrace";
import type { CreditTier } from "@/lib/billing/creditCostTable";
import { vellaTextRequestSchema } from "@/lib/security/validationSchemas";
import { validationErrorResponse, formatZodError } from "@/lib/security/validationErrors";
import { buildObservabilityMeta, logSecurityEvent, logTokenLedgerEvent } from "@/lib/security/observability";
import { isAIDisabled } from "@/lib/security/killSwitch";
import { safeErrorLog } from "@/lib/security/logGuard";
import {
  SafeDataError,
  serverTextStorageBlockedResponse,
  piiViolationResponse,
} from "@/lib/safe/safeSupabaseWrite";
import { filterUnsafeContent } from "@/lib/safety/complianceFilter";
import { buildDeterministicFallback } from "@/lib/intelligence/deterministicFallback";
import { assertNoPII, PIIFirewallError } from "@/lib/security/piiFirewall";
import { buildConversationMetadata } from "@/lib/conversation/metadata";
import { z } from "zod";
import { buildFocusInterventionMessage } from "@/lib/focus/interventions";
import { buildConversationContext, formatConversationForPrompt } from "@/lib/llm/contextBuilder";
import { fromSafe } from "@/lib/supabase/admin";
import { detectProposal } from "@/lib/session/proposalDetector";
import type { FocusDomain } from "@/lib/focusAreas";
import type { PendingProposal } from "@/lib/session/negotiationState";

/**
 * Credit-based billing for /api/vella/text:
 * - Intent router: engine-first classification with conservative fallback
 * - Fixed credit costs: simple=5, complex=10, deep=20
 * - Per-tier output caps: simple=300, complex=700, deep=1500
 * - Per-tier memory caps: simple=800, complex=2000, deep=4000 chars
 * - Atomic credit charging via withMonetisedOperation
 * - Abort-safe refund guarantee
 */

const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_SEC = 60;

/** Dev-only plan override. NEVER works in production. */
function getDevPlanOverride(): "free" | "pro" | "elite" | null {
  if (process.env.NODE_ENV === "production") return null;
  const override = process.env.VELLA_DEV_FORCE_PLAN;
  if (override === "free" || override === "pro" || override === "elite") return override;
  return null;
}

/** Build NextResponse with trace headers + optional __debug payload. */
function tracedResponse(
  body: Record<string, unknown>,
  status: number,
  trace: VellaTrace,
  debug: boolean,
): NextResponse {
  finalizeTrace(trace);
  const headers = traceHeaders(trace);
  const payload = debug ? { ...body, __debug: buildDebugPayload(trace) } : body;
  return NextResponse.json(payload, { status, headers });
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

/**
 * PHASE SEAL HARDENING (20260240):
 * This route processes personal text IN MEMORY ONLY.
 * - Text is received from client
 * - Text is processed by OpenAI
 * - Text is NEVER stored in Supabase
 * - Only METADATA is stored (messageCount, tokenCount, mode_enum)
 * - Text is explicitly cleared after processing
 * - PII Firewall validates no text leakage to database
 *
 * ABORT-SAFE REFUND (20260301):
 * Uses withMonetisedOperation wrapper to guarantee refund on client abort.
 */
export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const trace = createTrace(requestId);
  const debug = isDebugEnabled(req);
  
  if (isAIDisabled()) {
    trace.error = { stage: "killswitch", message: "AI kill-switch is active", code: "AI_DISABLED", status: 503 };
    trace.route_path = "ai_disabled";
    return tracedResponse({ code: "AI_DISABLED", reason: "AI is temporarily disabled", details: {} }, 503, trace, debug);
  }
  const startMs = Date.now();
  // Step 1+2: Require entitlement (includes active user check + feature gating)
  const entitlement = await requireEntitlement("chat_text");
  if (isEntitlementBlocked(entitlement)) {
    // Extract denial code from the opaque NextResponse for logging
    let denyBody: Record<string, unknown> = {};
    try { denyBody = await entitlement.clone().json(); } catch { /* non-JSON */ }
    const code = (denyBody.code as string) ?? "ENTITLEMENT_BLOCKED";
    const reason = (denyBody.error as string) ?? (denyBody.message as string) ?? "unknown";
    trace.error = { stage: "entitlement", message: reason, code, status: entitlement.status };
    trace.route_path = "entitlement_blocked";
    console.warn("[vella/text] DENY", { code, reason, status: entitlement.status });
    return tracedResponse(
      { code, reason, details: { feature: "chat_text", originalStatus: entitlement.status } },
      entitlement.status, trace, debug
    );
  }

  // Apply dev plan override (non-production only)
  const devPlanOverride = getDevPlanOverride();
  const plan = devPlanOverride ?? entitlement.plan;
  if (devPlanOverride) {
    trace.plan_override = devPlanOverride;
    console.info(`[VELLA_TRACE] DEV PLAN OVERRIDE: ${entitlement.plan} → ${devPlanOverride}`);
  }
  const { userId } = entitlement;
  trace.user_id = userId;
  trace.plan = plan;
  trace.session_type = "anon"; // all current users are anonymous
  trace.entitlements = {
    maxMonthlyTokens: entitlement.entitlements.maxMonthlyTokens,
    enableDeepMemory: entitlement.entitlements.enableDeepMemory,
  };

  const ip = getClientIp(req);
  const obsMeta = () => buildObservabilityMeta(requestId, ROUTE_NAME, startMs, { userId, ip });

  // Step 3: Rate limit (must be before token operations)
  const rateLimitResult = await rateLimit({
    key: `vella_text:${userId}`,
    limit: RATE_LIMIT_REQUESTS,
    window: RATE_LIMIT_WINDOW_SEC,
    routeKey: "vella_text",
  });
  if (!rateLimitResult.allowed) {
    if (rateLimitResult.status === 503) {
      console.warn("[vella/text] DENY", { code: "RATE_LIMIT_UNAVAILABLE", reason: "Rate limiter service unavailable" });
      return NextResponse.json(
        { code: "RATE_LIMIT_UNAVAILABLE", reason: "Rate limiting unavailable", details: {} },
        { status: 503 }
      );
    }
    console.warn("[vella/text] DENY", { code: "RATE_LIMITED", reason: `Retry after ${rateLimitResult.retryAfterSeconds}s` });
    return rateLimit429Response(rateLimitResult.retryAfterSeconds, obsMeta());
  }

  // Step 4: Request validation
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    console.warn("[vella/text] DENY", { code: "INVALID_JSON", reason: "Request body is not valid JSON" });
    return NextResponse.json(
      { code: "INVALID_JSON", reason: "Invalid JSON body", details: {} },
      { status: 400 }
    );
  }

  let text: string;
  let rawLanguage: string | undefined;
  let sessionId: string | undefined | null;
  let requestedMode: string | null | undefined;
  let osMode: string | null | undefined;
  let interactionMode: string | null | undefined;
  let image: string | null = null;
  let hasImage = false;
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
    osMode = null;
    interactionMode = null;
    image = null;
    activeValues = undefined;
    conversationHistory = undefined;
  } else {
    const parseResult = vellaTextRequestSchema.safeParse(json);
    if (!parseResult.success) {
      const zodMsg = formatZodError(parseResult.error);
      console.warn("[vella/text] DENY", { code: "VALIDATION_ERROR", reason: zodMsg });
      return NextResponse.json(
        { code: "VALIDATION_ERROR", reason: zodMsg, details: {} },
        { status: 400 }
      );
    }
    const parsed = parseResult.data;
    text = parsed.message;
    rawLanguage = parsed.language;
    sessionId = parsed.session_id;
    requestedMode = parsed.mode;
    osMode = parsed.osMode;
    interactionMode = parsed.interactionMode ?? null;
    image = parsed.image ?? null;
    hasImage = parsed.hasImage === true;
    console.log("[VellaVision] ROUTE", { hasImage, imageLength: image?.length ?? 0, imageSlice: image?.slice(0, 50) });
    activeValues = parsed.activeValues;
    conversationHistory = parsed.conversationHistory;
  }

  const limitedHistory = conversationHistory
    ? buildConversationContext(conversationHistory)
    : [];
  const conversationContext =
    limitedHistory.length > 0 ? formatConversationForPrompt(limitedHistory) : undefined;

  const language = rawLanguage ?? "en";

  // Phase Seal: PII Firewall validation - ensure no text leaks to database
  // Contract: buildConversationMetadata returns snake_case keys only.
  try {
    const metadata = buildConversationMetadata({
      userId,
      sessionId: sessionId ?? null,
      mode: null,
      language,
      messageLength: text?.length ?? 0,
    });
    assertNoPII(metadata, "conversation_metadata_v2");
  } catch (error) {
    if (error instanceof PIIFirewallError) {
      console.warn("[vella/text] DENY", { code: "PII_FIREWALL", reason: "Metadata validation failed" });
      return NextResponse.json(
        { code: "PII_FIREWALL", reason: "Metadata validation failed", details: { requestId } },
        { status: 400 }
      );
    }
    throw error;
  }

  // Short-circuit for guided exercises (no OpenAI call — no quota check or charge).
  const exerciseReply = buildExerciseReply(text);
  if (exerciseReply) {
    console.log("ROUTE PATH:", "exercise_short_circuit");
    const safeExerciseReply = await filterUnsafeContent(exerciseReply);
    await recordConversationMetadataV2({ userId, messageCount: 2, tokenCount: 0, mode_enum: null });
    console.log("SERVER RETURNING [exercise]:", safeExerciseReply);
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
        mode: "exercise",
      },
      { status: 200 }
    );
  }

  // PHASE: Intent Router
  // Detect first message: no prior assistant turns in conversationHistory
  const isFirstMessage = !conversationHistory || conversationHistory.length === 0
    || !conversationHistory.some((m) => m.role === "assistant");

  const routerTrace = routeIntentWithTrace(text, {
    isFirstMessage,
    sessionHistoryLength: conversationHistory?.length ?? 0,
  });
  const routerResult = routerTrace.result;
  logRouterDecision(text, routerResult);

  // Populate trace with router decision (including new fields)
  trace.router_decision = {
    mode: routerResult.mode,
    tier: routerResult.tier,
    reason: routerTrace.reason,
    word_count: routerTrace.word_count,
    char_count: routerTrace.char_count,
    rules_triggered: routerTrace.rules_triggered,
    is_first_message: routerTrace.is_first_message,
    greeting_matched: routerTrace.greeting_matched,
    token_blocked: false, // updated below if token gate blocks
  };

  // GREETING TEMPLATE MODE: No AI call, no billing — intentional friendly response
  if (routerResult.mode === "greeting_template") {
    trace.route_path = "greeting_template";
    trace.openai_call.attempted = false;
    const greetingReply = "I\u2019m here \u2014 what\u2019s on your mind? Share what you\u2019re thinking and I\u2019ll help you work through it.";
    await recordConversationMetadataV2({ userId, messageCount: 2, tokenCount: 0, mode_enum: null });
    return tracedResponse({
      reply: greetingReply,
      resultType: "text",
      mode: "greeting_template",
      reason: "greeting_template",
      creditsRemaining: 0,
    }, 200, trace, debug);
  }

  // ENGINE MODE: No AI call, no billing
  if (routerResult.mode === "engine") {
    trace.route_path = "engine_mode";
    trace.openai_call.attempted = false;
    
    // Try exercise first, then deterministic fallback
    const exerciseReply = buildExerciseReply(text);
    if (exerciseReply) {
      trace.route_path = "engine_exercise";
      const safeExerciseReply = await filterUnsafeContent(exerciseReply);
      await recordConversationMetadataV2({ userId, messageCount: 2, tokenCount: 0, mode_enum: null });
      return tracedResponse(
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
          mode: "engine",
          creditsRemaining: 0,
        },
        200, trace, debug
      );
    }

    // Deterministic engine response
    trace.route_path = "engine_deterministic";
    const engineReply = await buildDeterministicFallback({ text, userId });
    await recordConversationMetadataV2({ userId, messageCount: 2, tokenCount: 0, mode_enum: null });
    return tracedResponse({
      reply: engineReply,
      resultType: "text",
      mode: "engine",
      creditsRemaining: 0,
    }, 200, trace, debug);
  }

  // AI MODE: Fixed credit cost based on tier
  const tier = routerResult.tier as CreditTier;
  const creditCost = getCreditCost(tier);
  const outputCap = CREDIT_OUTPUT_CAP[tier];
  const memoryCap = MEMORY_CHAR_CAP[tier];

  // PHASE: Memory Retrieval with Tier Cap
  const hasDeepMemory = entitlement.entitlements.enableDeepMemory;
  const memoryBlocks = await retrieveTopK({
    userId,
    queryText: text,
    tier: plan,
  }).catch(() => []);

  // Build memory context but cap at tier limit
  const memoryContextResult = await buildCompleteMemoryContext({
    userId,
    tier: plan,
    recentBlocks: memoryBlocks,
    includeExcerpts: hasDeepMemory,
    entitlements: entitlement.entitlements,
  });

  // Apply memory cap based on tier
  let memoryContext = memoryContextResult.context;
  if (memoryContext && memoryContext.length > memoryCap) {
    memoryContext = memoryContext.slice(0, memoryCap);
    console.log("[vella/text] Memory capped:", { original: memoryContextResult.charCount, capped: memoryCap, tier });
  }

  // PHASE: Credit Availability Check
  const creditCheck = await checkCreditAvailability(userId, plan, creditCost, "vella_text");
  trace.token_balance_before = creditCheck.remaining;

  // Billing system unavailable → 503 for ALL plans (never mask as engine)
  if (creditCheck.mode === "unavailable") {
    trace.error = { stage: "gate", message: "billing_unavailable: storage or balance error", code: "BILLING_UNAVAILABLE", status: 503 };
    trace.route_path = "billing_unavailable";
    return tracedResponse({ code: "BILLING_UNAVAILABLE" }, 503, trace, debug);
  }

  // Insufficient credits (billing is working, user just doesn't have enough)
  if (!creditCheck.allowed) {
    trace.router_decision.token_blocked = true;
    trace.router_decision.reason = "token_blocked";
    trace.error = { stage: "gate", message: `insufficient tokens: remaining=${creditCheck.remaining}, cost=${creditCost}`, code: "INSUFFICIENT_CREDITS", status: plan !== "free" ? 402 : 200 };

    // PAID PLAN: Return 402 (no silent fallback)
    if (plan !== "free") {
      trace.route_path = "insufficient_credits_402";
      return tracedResponse(
        { code: "INSUFFICIENT_TOKENS", reason: "Quota exceeded", details: { remaining: creditCheck.remaining, cost: creditCost, plan } },
        402, trace, debug
      );
    }

    // FREE PLAN: Clear token-blocked message (never looks broken)
    trace.route_path = "token_blocked";
    const tokenBlockedReply = "You\u2019re out of tokens for this period. Upgrade your plan or wait for your monthly reset to continue.";
    return tracedResponse({
      reply: tokenBlockedReply,
      resultType: "text",
      mode: "engine",
      reason: "token_blocked",
      creditsRemaining: creditCheck.remaining,
      upgradeAvailable: true,
    }, 200, trace, debug);
  }

  // PHASE: Governance & Behaviour Context (only for AI mode)
  let governance = await getGovernanceStateForUser(userId);
  if (isGovernanceStale(governance)) {
    await computeGovernanceState(userId).catch(() => {});
    governance = await getGovernanceStateForUser(userId);
  }
  let finalMode = resolveMode((requestedMode ?? null) as VellaMode | null, governance);

  const [violationCounts, focusSessionsLast7d, activeCommitments, counts30d, focus30d, priorTrend, systemStatusResult, userPrefsResult] = await Promise.all([
    getRecentViolationCounts(userId),
    getFocusSessionsCountLast7d(userId),
    getActiveCommitmentsMetadata(userId),
    getViolationAndCompletionCounts30d(userId),
    getFocusSessionsCountLast30d(userId),
    getPriorViolationTrendSnapshot(userId),
    fromSafe("system_status_current")
      .select("top_priority_domain, enforcement_mode")
      .eq("user_id", userId)
      .maybeSingle(),
    fromSafe("user_preferences")
      .select("selected_focus_domains")
      .eq("user_id", userId)
      .maybeSingle(),
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

  // Proposal detection
  const sysData = systemStatusResult.data as {
    top_priority_domain: string;
    enforcement_mode: string;
  } | null;
  const prefsData = userPrefsResult.data as {
    selected_focus_domains: string[];
  } | null;
  const selectedDomains: FocusDomain[] =
    prefsData && Array.isArray(prefsData.selected_focus_domains)
      ? (prefsData.selected_focus_domains as FocusDomain[])
      : [];

  let proposal: PendingProposal | null = detectProposal({
    contradictionDetected: behaviourSnapshot.contradictionDetected,
    recentCommitmentViolations: behaviourSnapshot.recentCommitmentViolations,
    recentAbstinenceViolations: behaviourSnapshot.recentAbstinenceViolations,
    riskScore: behaviourSnapshot.riskScore,
    escalationLevel: behaviourSnapshot.escalationLevel,
    topPriorityDomain: sysData?.top_priority_domain ?? null,
    urgencyLevel: null,
    enforcementMode: sysData?.enforcement_mode ?? null,
    selectedDomains,
  });

  // Gate: AI contract proposals only in Plan interaction mode
  if (interactionMode !== "plan") {
    proposal = null;
  }

  const prompt = buildVellaTextPrompt({
    userMessage: text,
    language,
    memoryContext: memoryContext || undefined,
    behaviourSnapshot,
    conversationContext: conversationContext || undefined,
  });

  // PHASE: Abort-Safe Monetised Operation (Credit-Based)
  trace.openai_call.attempted = true;
  trace.openai_call.model = "gpt-4o-mini";
  const openaiStartMs = Date.now();
  const result = await withMonetisedOperation(
    {
      userId,
      plan,
      estimatedTokens: creditCost, // Pass credit cost as token equivalent for RPC
      operation: "vella_text",
      route: "vella_text",
      channel: "text",
      featureKey: "chat_text",
      request: req,
    },
    async () => {
      logTokenLedgerEvent({ eventType: "openai_start", userId, requestId, route: "vella_text" });

      let completionResult: { text: string; visionUsed: boolean };
      try {
        // Pass output cap constraint based on tier
        completionResult = await runVellaTextCompletion(prompt, userId, {
          mode: finalMode,
          interactionMode: (interactionMode as "reflect" | "guide" | "plan" | null) ?? undefined,
          imageUrl: image,
          hasImage,
          userMessage: text,
          maxTokens: outputCap,
        });
      } catch (err) {
        trace.openai_call.success = false;
        trace.openai_call.duration_ms = Date.now() - openaiStartMs;
        const errMsg = err instanceof Error ? err.message : "openai_failed";
        trace.openai_call.error_message = errMsg;
        logTokenLedgerEvent({ eventType: "openai_complete", userId, requestId, route: "vella_text", success: false });

        // Vision hard-fail: return 400 instead of generic 503
        if (errMsg.startsWith("VISION_IMAGE_REJECTED:")) {
          const reason = errMsg.split(":")[1] ?? "unknown";
          throw new Error(`VISION_IMAGE_REJECTED:${reason}`);
        }
        throw new Error("openai_failed");
      }

      trace.openai_call.success = true;
      trace.openai_call.duration_ms = Date.now() - openaiStartMs;
      logTokenLedgerEvent({ eventType: "openai_complete", userId, requestId, route: "vella_text", success: true });

      const safeReply = await filterUnsafeContent(completionResult.text);

      // Crisis mode event recording
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

      // Record conversation metadata with credit cost
      await recordConversationMetadataV2({
        userId,
        messageCount: 2,
        tokenCount: creditCost,
        modelId: "vella_text",
        mode_enum: finalMode,
      });

      logSecurityEvent({ ...obsMeta(), outcome: "ok" });

      return {
        reply: safeReply,
        resultType: "text",
        emotionIntel: null,
        sessionState: null,
        proposal: proposal ?? undefined,
        visionUsed: completionResult.visionUsed,
      };
    }
  );

  // Handle operation result
  if (!result.success) {
    const errorCode = result.code || result.error?.toLowerCase() || "";
    trace.token_balance_after = result.remaining ?? null;

    // Insufficient balance at charge time (race between pre-check and charge)
    if (errorCode === "insufficient_balance") {
      trace.router_decision.token_blocked = true;
      trace.router_decision.reason = "token_blocked";
      trace.error = { stage: "charge", message: `insufficient_balance at charge time: remaining=${result.remaining}`, code: "INSUFFICIENT_BALANCE", status: plan !== "free" ? 402 : 200 };

      // PAID PLAN: 402 — no silent fallback
      if (plan !== "free") {
        trace.route_path = "charge_insufficient_402";
        return tracedResponse(
          { code: "INSUFFICIENT_TOKENS", reason: "Quota exceeded", details: { remaining: result.remaining ?? 0, plan } },
          402, trace, debug
        );
      }

      // FREE PLAN: Clear token-blocked message
      trace.route_path = "token_blocked";
      const tokenBlockedReply = "You\u2019re out of tokens for this period. Upgrade your plan or wait for your monthly reset to continue.";
      return tracedResponse({
        reply: tokenBlockedReply,
        resultType: "text",
        mode: "engine",
        reason: "token_blocked",
        creditsRemaining: result.remaining ?? 0,
        upgradeAvailable: true,
      }, 200, trace, debug);
    }

    if (errorCode.includes("pii_firewall") || result.error?.toLowerCase().includes("pii_firewall")) {
      trace.error = { stage: "pii_firewall", message: "Metadata validation failed", code: "PII_FIREWALL", status: 400 };
      trace.route_path = "pii_firewall";
      finalizeTrace(trace);
      return piiViolationResponse(requestId, "Metadata validation failed");
    }

    // Vision image rejected → 400
    if (errorCode.includes("vision_image_rejected") || result.error?.includes("VISION_IMAGE_REJECTED")) {
      const reason = result.error?.split(":")[1] ?? "unknown";
      trace.error = { stage: "vision", message: `Image rejected: ${reason}`, code: "VISION_IMAGE_REJECTED", status: 400 };
      trace.route_path = "vision_rejected";
      return tracedResponse({ error: "VISION_IMAGE_REJECTED", reason }, 400, trace, debug);
    }

    // True system failures → 503
    trace.error = { stage: "operation", message: result.error ?? "unknown operation failure", code: "BILLING_UNAVAILABLE", status: 503 };
    trace.route_path = "operation_failed";
    safeErrorLog("[vella/text] operation failed", new Error(result.error));
    return tracedResponse({ code: "BILLING_UNAVAILABLE" }, 503, trace, debug);
  }

  // Success path
  trace.token_balance_after = result.remaining ?? null;
  trace.route_path = "ai_success";

  return tracedResponse({
    ...result.data,
    mode: "ai",
    reason: trace.router_decision.reason,
    creditsRemaining: result.remaining ?? 0,
  }, 200, trace, debug);
}
