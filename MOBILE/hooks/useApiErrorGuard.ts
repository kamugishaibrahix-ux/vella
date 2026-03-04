"use client";

/**
 * API Error Guard Hook
 * 
 * Standardizes frontend handling for 403/402 responses from backend.
 * Maps backend error codes to UI actions and modal states.
 * 
 * PHASE B - UX Hardening:
 * When quota_exceeded (402) is received, triggers immediate state reconciliation
 * by refreshing token balance and entitlements. This ensures UI reflects reality
 * without waiting for next polling interval.
 * 
 * Backend error codes:
 * - account_inactive → show account inactive modal
 * - feature_not_available → show UpgradeModal with specific feature highlighted
 * - quota_exceeded → show token depletion state + top-up CTA (if allowed) or upgrade
 * - subscription_suspended → show reactivation modal
 * 
 * Usage:
 * ```tsx
 * const { handleError, errorState, clearError } = useApiErrorGuard();
 * 
 * // In API call catch block:
 * const error = await res.json();
 * handleError(error, res.status);
 * 
 * // In render:
 * {errorState.type === 'upgrade' && (
 *   <UpgradeModal 
 *     isOpen={true} 
 *     onClose={clearError}
 *     highlightedFeature={errorState.feature}
 *   />
 * )}
 * ```
 */

import { useState, useCallback } from "react";
import type { FeatureKey } from "@/lib/tokens/costSchedule";
import { useAccountStatusOptional } from "@/app/components/providers/AccountStatusProvider";

export type ErrorCode = 
  | "account_inactive"
  | "ai_not_configured"
  | "feature_not_available"
  | "quota_exceeded"
  | "subscription_suspended"
  | "rate_limit_exceeded"
  | "unknown";

export interface ErrorState {
  type: ErrorCode | null;
  feature?: FeatureKey | string;
  message?: string;
  retryAfter?: number;
}

export interface ApiErrorResponse {
  error?: string;
  code?: string;
  feature?: string;
  plan?: string;
  message?: string;
  retryAfter?: number;
}

export interface UseApiErrorGuardReturn {
  /** Current error state (null if no error) */
  errorState: ErrorState;
  
  /** Process an API error response */
  handleError: (error: ApiErrorResponse | null, statusCode?: number) => boolean;
  
  /** Clear the current error state */
  clearError: () => void;
  
  /** Check if there's an active error */
  hasError: boolean;
  
  /** Check if the error blocks further action */
  isBlocking: boolean;
}

/**
 * Map backend error codes to standardized error types.
 */
function mapErrorCode(backendCode: string | undefined): ErrorCode {
  if (!backendCode) return "unknown";
  
  const code = backendCode.toLowerCase();
  
  if (code.includes("inactive") || code.includes("suspended")) {
    return code.includes("subscription") ? "subscription_suspended" : "account_inactive";
  }
  
  if (code.includes("ai_not_configured") || code.includes("not_configured")) {
    return "ai_not_configured";
  }

  if (code.includes("feature") || code.includes("not_available")) {
    return "feature_not_available";
  }
  
  if (code.includes("quota") || code.includes("exceeded") || code.includes("limit")) {
    return "quota_exceeded";
  }
  
  if (code.includes("rate") || code.includes("throttle")) {
    return "rate_limit_exceeded";
  }
  
  return "unknown";
}

/**
 * Check if an error is blocking (should prevent further user action).
 */
function isBlockingError(type: ErrorCode): boolean {
  return type === "account_inactive" || 
         type === "subscription_suspended" ||
         type === "quota_exceeded";
}

/**
 * Hook for standardized API error handling.
 * 
 * PHASE B: Integrates with AccountStatusProvider to trigger immediate
 * state reconciliation on quota errors.
 */
export function useApiErrorGuard(): UseApiErrorGuardReturn {
  const [errorState, setErrorState] = useState<ErrorState>({ type: null });
  const accountStatus = useAccountStatusOptional();

  const handleError = useCallback((
    error: ApiErrorResponse | null,
    statusCode?: number
  ): boolean => {
    // No error - clear state
    if (!error && !statusCode) {
      setErrorState({ type: null });
      return false;
    }

    // Determine error type from backend code or HTTP status
    let errorType: ErrorCode = "unknown";
    
    if (error?.code) {
      errorType = mapErrorCode(error.code);
    } else if (error?.error) {
      errorType = mapErrorCode(error.error);
    } else if (statusCode === 403) {
      errorType = "feature_not_available";
    } else if (statusCode === 402) {
      errorType = "quota_exceeded";
    } else if (statusCode === 429) {
      errorType = "rate_limit_exceeded";
    }

    const newState: ErrorState = {
      type: errorType,
      feature: error?.feature,
      message: error?.message || error?.error,
      retryAfter: error?.retryAfter,
    };

    setErrorState(newState);

    // PHASE 7: Hard stop on 402 – trigger entitlement refresh + set depleted
    if ((errorType === "quota_exceeded" || statusCode === 402) && accountStatus?.refresh) {
      console.log("[useApiErrorGuard] 402 hard stop – triggering entitlements refresh + depleted state");
      accountStatus.refresh();
    }
    
    return isBlockingError(errorType);
  }, [accountStatus]);

  const clearError = useCallback(() => {
    setErrorState({ type: null });
  }, []);

  return {
    errorState,
    handleError,
    clearError,
    hasError: errorState.type !== null,
    isBlocking: errorState.type !== null && isBlockingError(errorState.type),
  };
}

/**
 * Utility to extract error from fetch response.
 * Usage: const error = await extractApiError(response);
 */
export async function extractApiError(response: Response): Promise<ApiErrorResponse | null> {
  if (response.ok) return null;
  
  try {
    const data = await response.json();
    return {
      error: data.error,
      code: data.code,
      feature: data.feature,
      plan: data.plan,
      message: data.message,
      retryAfter: data.retryAfter || response.headers.get("Retry-After") ? 
        parseInt(response.headers.get("Retry-After") || "0", 10) : undefined,
    };
  } catch {
    // Could not parse JSON error
    return {
      error: `HTTP ${response.status}`,
      message: response.statusText,
    };
  }
}

/**
 * Standard error messages for UI display.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  account_inactive: "Your account is currently inactive. Please contact support.",
  ai_not_configured: "AI not configured",
  feature_not_available: "This feature is not available on your current plan.",
  quota_exceeded: "You've reached your monthly token limit. Upgrade to continue.",
  subscription_suspended: "Your subscription is suspended. Please update your payment method.",
  rate_limit_exceeded: "Too many requests. Please wait a moment and try again.",
  unknown: "Something went wrong. Please try again.",
};
