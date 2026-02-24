/**
 * Consistent error responses for AI endpoints.
 * All use { code, message } shape. Use these — do not return ad-hoc error bodies.
 * Pass ObservabilityMeta when available for privacy-safe security logging.
 */
import { NextResponse } from "next/server";
import { unauthResponse as _unauth } from "@/lib/supabase/server-auth";
import { rateLimit429Response, RATE_LIMITED_RESPONSE } from "@/lib/security/rateLimit";
import { quotaExceededResponse, QUOTA_EXCEEDED_RESPONSE } from "@/lib/tokens/quotaExceededResponse";
import { validationErrorResponse, VALIDATION_ERROR_RESPONSE } from "@/lib/security/validationErrors";
import type { ObservabilityMeta } from "@/lib/security/observability";
import { logSecurityEvent } from "@/lib/security/observability";

export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  RATE_LIMITED: "RATE_LIMITED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
} as const;

/** 401 — Authentication required */
export function unauthResponse(): NextResponse {
  return _unauth();
}

/** 429 — Rate limit exceeded */
export function rateLimitedResponse(retryAfterSeconds?: number, meta?: ObservabilityMeta): Response {
  return rateLimit429Response(retryAfterSeconds, meta);
}

/** 402 — Quota exceeded */
export function quotaExceeded(meta?: ObservabilityMeta): Response {
  return quotaExceededResponse(meta);
}

/** 400 — Validation error */
export function validationError(message?: string, meta?: ObservabilityMeta): NextResponse {
  return validationErrorResponse(message, meta);
}

/** 500 — Server / internal error */
export const SERVER_ERROR_RESPONSE = {
  code: "SERVER_ERROR" as const,
  message: "An unexpected error occurred. Please try again.",
};

export function serverErrorResponse(message?: string, meta?: ObservabilityMeta): NextResponse {
  if (meta) {
    logSecurityEvent({ ...meta, outcome: "server_error" });
  }
  return NextResponse.json(
    { code: SERVER_ERROR_RESPONSE.code, message: message ?? SERVER_ERROR_RESPONSE.message },
    { status: 500 }
  );
}

/** 503 — External service unavailable (e.g. circuit open, provider down) */
export const SERVICE_UNAVAILABLE_RESPONSE = {
  code: "SERVICE_UNAVAILABLE" as const,
  message: "Service temporarily unavailable. Please try again in a moment.",
};

export function serviceUnavailableResponse(message?: string): NextResponse {
  return NextResponse.json(
    { code: SERVICE_UNAVAILABLE_RESPONSE.code, message: message ?? SERVICE_UNAVAILABLE_RESPONSE.message },
    { status: 503 }
  );
}

/** 404 — Not found */
export const NOT_FOUND_RESPONSE = {
  code: "NOT_FOUND" as const,
  message: "Resource not found.",
};

export function notFoundResponse(message?: string): NextResponse {
  return NextResponse.json(
    { code: NOT_FOUND_RESPONSE.code, message: message ?? NOT_FOUND_RESPONSE.message },
    { status: 404 }
  );
}

/** 403 — Forbidden (e.g. policy block) */
export const FORBIDDEN_RESPONSE = {
  code: "FORBIDDEN" as const,
  message: "Access not allowed.",
};

export function forbiddenResponse(message?: string): NextResponse {
  return NextResponse.json(
    { code: FORBIDDEN_RESPONSE.code, message: message ?? FORBIDDEN_RESPONSE.message },
    { status: 403 }
  );
}

export { RATE_LIMITED_RESPONSE, QUOTA_EXCEEDED_RESPONSE, VALIDATION_ERROR_RESPONSE };
