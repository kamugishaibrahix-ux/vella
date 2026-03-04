/**
 * Token enforcement: atomic blocking when quota exceeded.
 * Uses a SECURITY DEFINER Postgres function (atomic_token_deduct) with
 * per-user advisory locking to eliminate the check→charge race condition.
 *
 * SINGLE ENTRY POINT: For monetized channels (text, audio, realtime_voice),
 * chargeTokensForOperation() and refundTokensForOperation() are the ONLY
 * allowed path. No route may bypass by calling chargeTokens (legacy) or any
 * other deduct/refund path for monetized flows.
 *
 * Model B: remaining = (allowance + topupsInWindow) − usageInWindow
 *
 * CONCURRENCY: pg_advisory_xact_lock serialises all token operations for
 * the same user. 50 concurrent requests queue, they do not race.
 *
 * IDEMPOTENCY: request_id is mandatory and enforced by DB UNIQUE constraint.
 * Network retries with same request_id cannot double-charge or double-refund.
 *
 * FAIL-CLOSED: If Supabase, billing window, or RPC fails → deny access.
 *
 * CHARGE-BEFORE-OPENAI SAFETY PATTERN:
 * ==============================================================================
 * To prevent losing money on OpenAI failures, routes MUST follow this pattern:
 *
 *   1. Pre-check (optional, for early 402): checkTokenAvailability()
 *   2. CHARGE: chargeTokensForOperation() — atomically deduct tokens FIRST
 *   3. CALL: OpenAI API with the charged tokens
 *   4. On OpenAI failure: refundTokensForOperation() — return tokens to user
 *
 * Example implementation:
 * ```
 * // 1. Charge BEFORE calling OpenAI
 * const requestId = crypto.randomUUID();
 * const chargeResult = await chargeTokensForOperation(userId, plan, tokens, ..., requestId);
 * if (!chargeResult.success) {
 *   return quotaExceededResponse();
 * }
 *
 * // 2. Call OpenAI (may fail)
 * let openAiResult;
 * try {
 *   openAiResult = await callOpenAI(...);
 * } catch (error) {
 *   // 3. OpenAI failed - REFUND the tokens using SAME requestId
 *   await refundTokensForOperation(userId, plan, tokens, ..., requestId);
 *   return errorResponse();
 * }
 *
 * // 4. Success - tokens already charged, return response
 * return successResponse(openAiResult);
 * ```
 *
 * This ensures we never pay OpenAI for failed requests and users are never
 * charged for service failures. Same requestId guarantees idempotency.
 * ==============================================================================
 */
import type { PlanTier } from "@/lib/tiers/planUtils";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";
import { type UsageChannel } from "@/lib/budget/usageServer";
import { getTokenBalanceForUser } from "./balance";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeDbCall, isDbUnavailableError } from "@/lib/server/safeDbCall";
import { resolvePlanEntitlements } from "@/lib/plans/resolvePlanEntitlements";
import { resolveBillingWindow } from "@/lib/billing/billingWindow";
import { chargeTokens } from "./chargeTokens";
import type { FeatureKey } from "./costSchedule";
import { logTokenLedgerEvent, incrementTokenDeduct, incrementTokenRefund } from "@/lib/security/observability";

const SAFETY_MULTIPLIER = 1.2;
const PER_REQUEST_CEILING = 100_000;

// Channels that consume tokens (require requestId)
const MONETIZED_CHANNELS: UsageChannel[] = ["text", "audio", "realtime_voice"];

export type TokenAvailabilityResult = {
  allowed: boolean;
  remaining: number;
  mode: "enforced" | "unavailable";
};

export type TokenChargeResult = {
  success: boolean;
  remaining: number;
  consumedFromAllocation: number;
  consumedFromBalance: number;
  mode: "enforced" | "unavailable";
  warning?: string;
};

export type TokenRefundResult = {
  success: boolean;
  refundedAmount: number;
  error: string | null;
  warning?: string;
};

/** Result from the atomic Postgres deduction RPC. */
interface AtomicDeductResult {
  success: boolean;
  remaining_balance: number;
  error: string | null;
  warning?: string;
}

/** Result from the atomic Postgres refund RPC. */
interface AtomicRefundResult {
  success: boolean;
  refunded_amount: number;
  error: string | null;
  warning?: string;
}

function isStorageAvailable(): boolean {
  return supabaseAdmin != null;
}

function isMonetizedChannel(channel: UsageChannel): boolean {
  return MONETIZED_CHANNELS.includes(channel);
}

/**
 * Converts channel + estimatedTokens into the normalised token count
 * that gets stored in token_usage (matches usageServer.ts conversion).
 */
function normaliseTokensForChannel(estimatedTokens: number, channel: UsageChannel): number {
  if (channel === "realtime_voice") {
    const seconds = Math.ceil(estimatedTokens / 20);
    return Math.max(0, Math.round(seconds * 20));
  }
  if (channel === "audio") {
    return 5000; // 1 clip = 5000 tokens
  }
  return Math.max(0, Math.round(estimatedTokens));
}

/**
 * Build the source string that matches the existing usageServer.ts format.
 */
function buildSource(channel: UsageChannel, route: string): string {
  return `usage:${channel}:${route}`;
}

/**
 * Core atomic deduction via Postgres RPC.
 *
 * Calls public.atomic_token_deduct() which:
 *   1. Validates request_id is present (mandatory)
 *   2. Acquires pg_advisory_xact_lock for this user
 *   3. Checks for existing charge with same request_id (idempotency)
 *   4. Computes balance within billing window
 *   5. Checks sufficiency
 *   6. Inserts usage row with request_id and kind='charge'
 *   7. Returns { success, remaining_balance, error, warning }
 *
 * Idempotent: Duplicate calls with same request_id return success with
 * warning='already_charged' without inserting a second row.
 */
async function atomicDeduct(
  userId: string,
  planTier: PlanTier,
  tokens: number,
  source: string,
  fromAllocation: boolean,
  requestId: string,
): Promise<AtomicDeductResult> {
  if (!supabaseAdmin) {
    return { success: false, remaining_balance: 0, error: "supabase_unavailable" };
  }

  // Resolve billing window (fail-closed)
  const window = await resolveBillingWindow(userId);
  if (!window) {
    return { success: false, remaining_balance: 0, error: "billing_window_unavailable" };
  }

  // Resolve allowance for the plan
  const entitlementResult = await resolvePlanEntitlements(planTier);
  const allowance = entitlementResult.entitlements.maxMonthlyTokens;

  let data: unknown;
  let error: { message: string } | null;
  try {
    const result = await safeDbCall(
      async () =>
        await (supabaseAdmin as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
            data: unknown;
            error: { message: string } | null;
          }>;
        }).rpc("atomic_token_deduct", {
          p_user_id: userId,
          p_request_id: requestId,
          p_tokens: tokens,
          p_source: source,
          p_from_alloc: fromAllocation,
          p_allowance: allowance,
          p_window_start: window.start.toISOString(),
          p_window_end: window.end.toISOString(),
        }),
      { operation: "atomic_token_deduct" },
    );
    data = result.data;
    error = result.error;
  } catch (e) {
    if (isDbUnavailableError(e)) {
      return { success: false, remaining_balance: 0, error: "db_unavailable" };
    }
    throw e;
  }

  if (error) {
    return { success: false, remaining_balance: 0, error: error.message };
  }

  // Parse the JSONB result
  const result = data as AtomicDeductResult | null;
  if (!result || typeof result.success !== "boolean") {
    return { success: false, remaining_balance: 0, error: "invalid_rpc_response" };
  }

  return result;
}

/**
 * Core atomic refund via Postgres RPC.
 *
 * Calls public.atomic_token_refund() which:
 *   1. Validates request_id is present (mandatory)
 *   2. Acquires pg_advisory_xact_lock for this user
 *   3. Checks for existing refund with same request_id (idempotency)
 *   4. Verifies original charge exists with matching request_id
 *   5. Validates refund amount <= charge amount
 *   6. Inserts usage row with request_id and kind='refund'
 *   7. Returns { success, refunded_amount, error, warning }
 *
 * Idempotent: Duplicate calls with same request_id return success with
 * warning='refund_already_processed' without inserting a second row.
 */
async function atomicRefund(
  userId: string,
  tokens: number,
  source: string,
  requestId: string,
): Promise<AtomicRefundResult> {
  if (!supabaseAdmin) {
    return { success: false, refunded_amount: 0, error: "supabase_unavailable" };
  }

  let data: unknown;
  let error: { message: string } | null;
  try {
    const result = await safeDbCall(
      async () =>
        await (supabaseAdmin as unknown as {
          rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
            data: unknown;
            error: { message: string } | null;
          }>;
        }).rpc("atomic_token_refund", {
          p_user_id: userId,
          p_request_id: requestId,
          p_tokens: tokens,
          p_source: source,
        }),
      { operation: "atomic_token_refund" },
    );
    data = result.data;
    error = result.error;
  } catch (e) {
    if (isDbUnavailableError(e)) {
      return { success: false, refunded_amount: 0, error: "db_unavailable" };
    }
    throw e;
  }

  if (error) {
    return { success: false, refunded_amount: 0, error: error.message };
  }

  // Parse the JSONB result
  const result = data as AtomicRefundResult | null;
  if (!result || typeof result.success !== "boolean") {
    return { success: false, refunded_amount: 0, error: "invalid_rpc_response" };
  }

  return result;
}

/**
 * Check if tokens are available before an AI operation. Blocks when quota exceeded.
 * Uses canonical token balance: remaining = (allowance + topups) − usage within billing window.
 * Fails closed: denies when balance cannot be determined or Supabase unavailable.
 *
 * NOTE: This is now a read-only pre-check. The actual enforcement happens in
 * chargeTokensForOperation() which uses the atomic RPC. This function remains
 * for backward compatibility so callers can show early 402 responses without
 * attempting the AI operation.
 *
 * IMPORTANT: Always call chargeTokensForOperation() BEFORE calling OpenAI,
 * then refundTokensForOperation() if OpenAI fails. See file header for pattern.
 */
export async function checkTokenAvailability(
  userId: string,
  planTier: PlanTier,
  estimatedTokens: number,
  route: string,
  channel: UsageChannel = "text",
): Promise<TokenAvailabilityResult> {
  const ceiling = Math.min(estimatedTokens * SAFETY_MULTIPLIER, PER_REQUEST_CEILING);
  const effectiveEstimate = Math.ceil(ceiling);

  console.log("[TOKEN DEBUG] checkTokenAvailability START:", {
    userId,
    planTier,
    estimatedTokens,
    effectiveEstimate,
    route,
    channel,
  });

  if (!isStorageAvailable()) {
    console.log("[TOKEN DEBUG] Storage unavailable, returning false");
    return { allowed: false, remaining: 0, mode: "unavailable" };
  }

  // Get canonical token balance (read-only, no lock)
  const balanceResult = await getTokenBalanceForUser(userId, planTier);

  console.log("[TOKEN DEBUG] balanceResult:", JSON.stringify(balanceResult));

  // Fail-closed: if balance cannot be determined, deny access
  if (balanceResult.error || !balanceResult.balance) {
    console.log("[TOKEN DEBUG] Balance error or null, returning false. error:", balanceResult.error);
    return { allowed: false, remaining: 0, mode: "unavailable" };
  }

  const { remaining } = balanceResult.balance;
  const allowed = remaining >= effectiveEstimate;

  console.log("[TOKEN DEBUG] Final check:", { remaining, effectiveEstimate, allowed });

  return { allowed, remaining, mode: "enforced" };
}

/**
 * Charge tokens BEFORE calling OpenAI. Uses atomic Postgres deduction.
 *
 * SAFETY PATTERN: Always call this BEFORE OpenAI, then refund if OpenAI fails.
 * Use the SAME requestId for charge and refund to ensure idempotency.
 *
 * IDEMPOTENCY: requestId is mandatory for monetized channels (text, audio, realtime).
 * The DB enforces UNIQUE (user_id, request_id, kind) preventing double charges.
 *
 * CONCURRENCY SAFE: The atomic_token_deduct RPC acquires a per-user advisory
 * lock (using hashtextextended for stable hashing), re-computes balance, checks
 * sufficiency, and inserts the usage row — all inside one transaction.
 * Even if 50 requests pass checkTokenAvailability simultaneously, only
 * requests with sufficient balance will succeed here.
 *
 * Deterministic error codes:
 *   - "missing_request_id" — requestId required but not provided
 *   - "insufficient_balance" — user has insufficient tokens
 *   - "invalid_user_id" — null or empty user ID
 *   - "invalid_token_amount" — tokens <= 0
 *   - "already_charged" — duplicate request_id, no charge performed
 *   - "internal_error" — unexpected error (fail-closed)
 *   - "supabase_unavailable" — database connection issue
 *   - "billing_window_unavailable" — cannot determine billing window
 *
 * @returns TokenChargeResult with success status and remaining balance
 */
export async function chargeTokensForOperation(
  userId: string,
  plan: "free" | "pro" | "elite",
  estimatedTokens: number,
  operationName: string,
  route: string,
  channel: UsageChannel = "text",
  featureKey?: FeatureKey,
  requestId?: string,
): Promise<TokenChargeResult> {
  const _chargeEnt = getDefaultEntitlements(plan);
  const fromAllocation = _chargeEnt.usesAllocationBucket;

  // Normalise tokens to match the storage format
  const normalisedTokens = normaliseTokensForChannel(estimatedTokens, channel);

  if (normalisedTokens <= 0) {
    return {
      success: true,
      remaining: 0,
      consumedFromAllocation: 0,
      consumedFromBalance: 0,
      mode: "enforced",
    };
  }

  // Enforce requestId for monetized channels
  if (isMonetizedChannel(channel) && !requestId) {
    return {
      success: false,
      remaining: 0,
      consumedFromAllocation: 0,
      consumedFromBalance: 0,
      mode: "enforced",
    };
  }

  // For non-monetized channels without requestId, generate one internally
  const effectiveRequestId = requestId || crypto.randomUUID();

  // INSTRUMENTATION: Charge lifecycle start
  logTokenLedgerEvent({
    eventType: "charge_start",
    userId,
    requestId: effectiveRequestId,
    route,
    tokens: normalisedTokens,
    channel,
    operationName,
  });

  // Atomic deduction via Postgres RPC (advisory lock + insert in one tx)
  const source = buildSource(channel, route);
  const result = await atomicDeduct(userId, plan, normalisedTokens, source, fromAllocation, effectiveRequestId);

  // Token Ledger Integrity Guard: never accept negative balance after deduct
  if (result.success && typeof result.remaining_balance === "number" && result.remaining_balance < 0) {
    logTokenLedgerEvent({
      eventType: "negative_balance_after_deduct",
      userId,
      requestId: effectiveRequestId,
      route,
      errorCode: result.error,
    });
    throw new Error(
      "CRITICAL: Token ledger integrity violation — remaining_balance < 0 after deduct. Do not retry."
    );
  }

  // Invariant: token_usage rows per requestId must be unique. Duplicate = block further processing.
  if (result.success && result.warning === "already_charged") {
    logTokenLedgerEvent({
      eventType: "duplicate_deduct_request_id",
      userId,
      requestId: effectiveRequestId,
      route,
      errorCode: result.warning,
    });
    throw new Error(
      "CRITICAL: Token ledger duplicate request_id (already_charged). Block further processing."
    );
  }

  if (!result.success) {
    return {
      success: false,
      remaining: result.remaining_balance,
      consumedFromAllocation: 0,
      consumedFromBalance: 0,
      mode: result.error === "supabase_unavailable" || result.error === "billing_window_unavailable" || result.error === "db_unavailable"
        ? "unavailable"
        : "enforced",
    };
  }

  // Record to legacy charge tokens (for backward compatibility / local counters)
  await chargeTokens(userId, plan, {
    textTokens: channel === "text" ? estimatedTokens : undefined,
    realtimeSeconds: channel === "realtime_voice" ? Math.ceil(estimatedTokens / 20) : undefined,
    audioClips: channel === "audio" ? 1 : undefined,
    route,
  });

  // INSTRUMENTATION: Charge lifecycle complete
  logTokenLedgerEvent({
    eventType: "charge_complete",
    userId,
    requestId: effectiveRequestId,
    route,
    tokens: normalisedTokens,
    remainingBalance: result.remaining_balance,
    channel,
    operationName,
  });

  // Increment observability counter for successful token deduction
  incrementTokenDeduct();

  return {
    success: true,
    remaining: result.remaining_balance,
    consumedFromAllocation: fromAllocation ? normalisedTokens : 0,
    consumedFromBalance: 0,
    mode: "enforced",
    warning: result.warning,
  };
}

/**
 * Refund tokens when OpenAI call fails after charging.
 *
 * SAFETY PATTERN: Call this when OpenAI fails after chargeTokensForOperation().
 * Use the SAME requestId that was used for the charge to ensure idempotency.
 *
 * IDEMPOTENCY: The DB enforces UNIQUE (user_id, request_id, kind) preventing
 * double refunds. Duplicate calls return success with warning.
 *
 * STRICT VALIDATION:
 *   - Original charge must exist with matching request_id
 *   - Refund amount cannot exceed charge amount
 *   - Exactly one refund per request_id
 *
 * @param userId - The user to refund
 * @param plan - The user's plan tier
 * @param estimatedTokens - The number of tokens to refund (must match charge amount)
 * @param operationName - Name of the operation for audit trail
 * @param route - API route name
 * @param channel - Usage channel (text, audio, realtime_voice)
 * @param requestId - The SAME request ID used for the charge (mandatory)
 * @returns TokenRefundResult with success status and refunded amount
 */
export async function refundTokensForOperation(
  userId: string,
  plan: "free" | "pro" | "elite",
  estimatedTokens: number,
  operationName: string,
  route: string,
  channel: UsageChannel = "text",
  requestId?: string,
): Promise<TokenRefundResult> {
  // Normalise tokens to match the storage format
  const normalisedTokens = normaliseTokensForChannel(estimatedTokens, channel);

  if (normalisedTokens <= 0) {
    return {
      success: true,
      refundedAmount: 0,
      error: null,
    };
  }

  // Enforce requestId for monetized channels
  if (isMonetizedChannel(channel) && !requestId) {
    return {
      success: false,
      refundedAmount: 0,
      error: "missing_request_id",
    };
  }

  // For non-monetized channels without requestId, cannot process refund
  if (!requestId) {
    return {
      success: false,
      refundedAmount: 0,
      error: "missing_request_id",
    };
  }

  const source = buildSource(channel, route);

  // INSTRUMENTATION: Refund lifecycle start
  logTokenLedgerEvent({
    eventType: "refund_start",
    userId,
    requestId,
    route,
    tokens: normalisedTokens,
    channel,
    operationName,
  });

  // Atomic refund via Postgres RPC (prevents refund if no matching prior deduction; idempotent via requestId)
  const result = await atomicRefund(userId, normalisedTokens, source, requestId);

  // Token Ledger Integrity: log when refund fails due to no matching charge (prevents silent misuse)
  if (!result.success && result.error === "original_charge_not_found") {
    logTokenLedgerEvent({
      eventType: "refund_no_matching_charge",
      userId,
      requestId,
      route,
      errorCode: result.error,
    });
  }

  // Invariant: duplicate refund attempt (idempotent success but log CRITICAL for audit)
  if (result.success && result.warning === "refund_already_processed") {
    logTokenLedgerEvent({
      eventType: "duplicate_refund_request_id",
      userId,
      requestId,
      route,
      errorCode: result.warning,
    });
  }

  if (!result.success) {
    return {
      success: false,
      refundedAmount: 0,
      error: result.error,
    };
  }

  // Increment observability counter for successful token refund
  incrementTokenRefund();

  // INSTRUMENTATION: Refund lifecycle complete
  logTokenLedgerEvent({
    eventType: "refund_complete",
    userId,
    requestId,
    route,
    refundedAmount: result.refunded_amount,
    channel,
    operationName,
    warning: result.warning,
  });

  return {
    success: true,
    refundedAmount: result.refunded_amount,
    error: null,
    warning: result.warning,
  };
}

/**
 * Check if credits are available before an AI operation.
 * Simplified version: fixed credit cost, no estimation, no safety multiplier.
 * Preserves fail-closed behavior and atomic RPC foundation.
 */
export async function checkCreditAvailability(
  userId: string,
  planTier: PlanTier,
  creditCost: number,
  route: string,
): Promise<TokenAvailabilityResult> {
  // Fail-closed: invalid cost
  if (!isFinite(creditCost) || creditCost <= 0) {
    console.warn("[checkCreditAvailability] Invalid credit cost:", creditCost);
    return { allowed: false, remaining: 0, mode: "unavailable" };
  }

  if (!isStorageAvailable()) {
    console.log("[checkCreditAvailability] Storage unavailable, returning false");
    return { allowed: false, remaining: 0, mode: "unavailable" };
  }

  // Get canonical balance (read-only, no lock)
  const balanceResult = await getTokenBalanceForUser(userId, planTier);

  console.log("[checkCreditAvailability] balanceResult:", JSON.stringify(balanceResult));

  // Fail-closed: if balance cannot be determined, deny access
  if (balanceResult.error || !balanceResult.balance) {
    console.log("[checkCreditAvailability] Balance error or null, returning false. error:", balanceResult.error);
    return { allowed: false, remaining: 0, mode: "unavailable" };
  }

  const { remaining } = balanceResult.balance;
  const allowed = remaining >= creditCost;

  console.log("[checkCreditAvailability] Final check:", { remaining, creditCost, allowed });

  return { allowed, remaining, mode: "enforced" };
}

export function getTokenWarningThreshold(_planTier: PlanTier): number {
  return 0.8;
}
