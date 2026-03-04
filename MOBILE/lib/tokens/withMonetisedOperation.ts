/**
 * Abort-Safe Monetised Operation Wrapper
 *
 * Guarantees token refund execution even if:
 * - Client aborts during OpenAI call
 * - OpenAI call throws error
 * - Any unexpected error occurs
 *
 * Design principles:
 * 1. No reliance on Express/Node response events (Next.js App Router incompatible)
 * 2. Pure AbortSignal + finally semantics
 * 3. Idempotent refund (safe to call multiple times)
 * 4. All code paths must hit finally block
 *
 * Usage:
 *   return withMonetisedOperation({
 *     userId, plan, estimatedTokens, operation: "clarity", route: "clarity", channel: "text",
 *     request: req,
 *     execute: async () => {
 *       // OpenAI call here
 *       return result;
 *     }
 *   });
 */

import { NextRequest } from "next/server";
import {
  chargeTokensForOperation as realChargeTokensForOperation,
  refundTokensForOperation as realRefundTokensForOperation,
} from "./enforceTokenLimits";
import { type PlanTier } from "@/lib/plans/types";
import { logTokenLedgerEvent } from "@/lib/security/observability";
import type { UsageChannel } from "@/lib/budget/usageEngine";
import type { FeatureKey } from "./costSchedule";

// Type definitions for charge/refund functions
export type ChargeTokensFunction = typeof realChargeTokensForOperation;
export type RefundTokensFunction = typeof realRefundTokensForOperation;

// Test-only injection hooks (undefined in production)
let testChargeFn: ChargeTokensFunction | undefined;
let testRefundFn: RefundTokensFunction | undefined;

/**
 * Inject mock implementations for testing.
 * ONLY used in test environments.
 */
export function injectTestTokenFunctions(
  chargeFn?: ChargeTokensFunction,
  refundFn?: RefundTokensFunction
) {
  testChargeFn = chargeFn;
  testRefundFn = refundFn;
}

/**
 * Clear test mocks and restore real implementations.
 */
export function clearTestTokenFunctions() {
  testChargeFn = undefined;
  testRefundFn = undefined;
}

// Get the appropriate charge function (test mock or real)
const getChargeFn = (): ChargeTokensFunction => {
  return testChargeFn ?? realChargeTokensForOperation;
};

// Get the appropriate refund function (test mock or real)
const getRefundFn = (): RefundTokensFunction => {
  return testRefundFn ?? realRefundTokensForOperation;
};

export type MonetisedOperationContext = {
  userId: string;
  plan: PlanTier;
  estimatedTokens: number;
  operation: string;
  route: string;
  channel: UsageChannel;
  featureKey?: FeatureKey;
  request: NextRequest | Request;
};

export type MonetisedOperationResult<T> =
  | { success: true; data: T; refunded: false; remaining: number }
  | { success: false; error: string; code?: string; remaining?: number; refunded: boolean; abortReason?: string };

/**
 * Execute a monetised operation with guaranteed refund on failure or abort.
 *
 * Guarantees:
 * - Charge only happens once
 * - Refund happens at most once (idempotent via requestId)
 * - Refund executes even if client disconnects mid-flight
 * - All errors are caught and result in refund
 */
export async function withMonetisedOperation<T>(
  context: MonetisedOperationContext,
  execute: () => Promise<T>
): Promise<MonetisedOperationResult<T>> {
  const { userId, plan, estimatedTokens, operation, route, channel, featureKey, request } = context;

  console.log("[MONETISED DEBUG] withMonetisedOperation START:", {
    userId,
    plan,
    estimatedTokens,
    operation,
    route,
    channel,
  });

  // Generate unique requestId for this operation
  const requestId = crypto.randomUUID();

  // State tracking
  let charged = false;
  let refunded = false;
  let successCommitted = false;
  let abortSignalReceived = false;

  // INSTRUMENTATION: Lifecycle start
  logTokenLedgerEvent({
    eventType: "monetised_operation_start",
    userId,
    requestId,
    route,
    tokens: estimatedTokens,
    operation,
  });

  // Setup abort listener if AbortSignal available
  const abortController = new AbortController();
  let abortTimeout: NodeJS.Timeout | null = null;

  // Monitor for client disconnect via request signal (Next.js/Node compatible)
  const signal = (request as any).signal as AbortSignal | undefined;

  if (signal) {
    signal.addEventListener("abort", () => {
      abortSignalReceived = true;
      logTokenLedgerEvent({
        eventType: "client_abort_detected",
        userId,
        requestId,
        route,
        reason: signal.reason as string,
      });
      abortController.abort();
    });
  }

  // Timeout safety net (OpenAI calls should not hang forever)
  const OPERATION_TIMEOUT_MS = 120_000; // 2 minutes max

  try {
    // STEP 1: Atomic charge BEFORE any OpenAI call
    // NOTE: charge_start is logged inside chargeTokensForOperation — no duplicate here.
    const chargeResult = await getChargeFn()(
      userId,
      plan,
      estimatedTokens,
      operation,
      route,
      channel,
      featureKey,
      requestId
    );

    console.log("[MONETISED DEBUG] chargeResult:", JSON.stringify(chargeResult));

    if (!chargeResult.success) {
      console.log("[MONETISED DEBUG] Charge FAILED:", { mode: chargeResult.mode, remaining: chargeResult.remaining });
      logTokenLedgerEvent({
        eventType: "charge_failed",
        userId,
        requestId,
        route,
        error: chargeResult.mode === "unavailable" ? "system_error" : "insufficient_balance",
      });
      return {
        success: false,
        error: chargeResult.mode === "unavailable"
          ? "billing_unavailable"
          : "insufficient_balance",
        code: chargeResult.mode === "unavailable"
          ? "billing_unavailable"
          : "insufficient_balance",
        remaining: chargeResult.remaining,
        refunded: false,
      };
    }

    charged = true;

    console.log("[MONETISED DEBUG] Charge SUCCESS, remaining:", chargeResult.remaining);
    console.log("[MONETISED DEBUG] About to execute OpenAI call...");

    logTokenLedgerEvent({
      eventType: "charge_complete",
      userId,
      requestId,
      route,
      tokens: estimatedTokens,
      remainingBalance: chargeResult.remaining,
    });

    // STEP 2: Execute OpenAI call with abort awareness
    logTokenLedgerEvent({
      eventType: "openai_start",
      userId,
      requestId,
      route,
    });

    // Set timeout for the operation
    abortTimeout = setTimeout(() => {
      abortController.abort("operation_timeout");
    }, OPERATION_TIMEOUT_MS);

    // If abort already signaled before execute, bail out
    if (abortController.signal.aborted) {
      throw new Error("Operation aborted before execution");
    }

    const result = await execute();

    // Check if abort was signaled during execution
    if (abortController.signal.aborted || abortSignalReceived) {
      throw new Error("Operation aborted during execution");
    }

    // Clear timeout on success
    if (abortTimeout) {
      clearTimeout(abortTimeout);
      abortTimeout = null;
    }

    successCommitted = true;

    logTokenLedgerEvent({
      eventType: "openai_complete",
      userId,
      requestId,
      route,
      success: true,
    });

    return {
      success: true,
      data: result,
      refunded: false,
      remaining: chargeResult.remaining,
    };
  } catch (error) {
    // Clear timeout on error
    if (abortTimeout) {
      clearTimeout(abortTimeout);
      abortTimeout = null;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isAbortError =
      abortSignalReceived ||
      errorMessage.includes("abort") ||
      errorMessage.includes("Abort");

    logTokenLedgerEvent({
      eventType: "openai_complete",
      userId,
      requestId,
      route,
      success: false,
      error: errorMessage,
    });

    // Refund will be handled in finally block
    return {
      success: false,
      error: errorMessage,
      refunded: false, // Will be set to true in finally
      abortReason: isAbortError ? "client_abort" : undefined,
    };
  } finally {
    // STEP 3: GUARANTEED REFUND CHECK
    // This block ALWAYS executes (even on client abort)
    if (charged && !successCommitted && !refunded) {
      logTokenLedgerEvent({
        eventType: "refund_start",
        userId,
        requestId,
        route,
        reason: successCommitted ? "success" : abortSignalReceived ? "client_abort" : "error",
      });

      try {
        // Perform idempotent refund (same requestId = idempotent)
        await getRefundFn()(
          userId,
          plan,
          estimatedTokens,
          operation,
          route,
          channel,
          requestId
        );

        refunded = true;

        logTokenLedgerEvent({
          eventType: "refund_complete",
          userId,
          requestId,
          route,
          refundedAmount: estimatedTokens,
        });
      } catch (refundError) {
        // Log but don't throw - we must not hide the original error
        logTokenLedgerEvent({
          eventType: "refund_failed",
          userId,
          requestId,
          route,
          error: refundError instanceof Error ? refundError.message : "unknown",
        });
      }
    }

    // Cleanup abort listener
    if (signal) {
      // Note: AbortSignal listeners auto-remove after abort, but if not aborted:
      // We can't easily remove the listener without storing the handler reference
      // In practice this is fine as the request ends after this function
    }

    logTokenLedgerEvent({
      eventType: "monetised_operation_end",
      userId,
      requestId,
      route,
      charged,
      refunded,
      successCommitted,
      abortSignalReceived,
    });
  }
}

/**
 * Legacy wrapper for routes that need a simpler API.
 * Returns the data directly on success, throws on failure.
 */
export async function executeMonetisedOrRefund<T>(
  context: MonetisedOperationContext,
  execute: () => Promise<T>
): Promise<T> {
  const result = await withMonetisedOperation(context, execute);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}
