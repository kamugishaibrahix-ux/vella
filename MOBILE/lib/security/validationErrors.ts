/**
 * Validation error response helpers for consistent 400 responses.
 * All validation errors use { code: "VALIDATION_ERROR", message: string } shape.
 */
import { NextResponse } from "next/server";
import type { ObservabilityMeta } from "./observability";
import { logSecurityEvent } from "./observability";

export const VALIDATION_ERROR_RESPONSE = {
  code: "VALIDATION_ERROR" as const,
  message: "Invalid request data.",
};

export function validationErrorResponse(message?: string, meta?: ObservabilityMeta): NextResponse {
  if (meta) {
    logSecurityEvent({ ...meta, outcome: "validation_error" });
  }
  return NextResponse.json(
    {
      code: "VALIDATION_ERROR",
      message: message ?? VALIDATION_ERROR_RESPONSE.message,
    },
    { status: 400 }
  );
}

/**
 * Helper to format Zod validation errors into a readable message.
 */
export function formatZodError(error: unknown): string {
  if (typeof error === "object" && error !== null && "issues" in error) {
    const issues = (error as { issues: Array<{ path: string[]; message: string }> }).issues;
    return issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
  }
  return "Invalid request data.";
}
