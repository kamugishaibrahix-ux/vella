/**
 * Supabase exhaustion resilience: no unhandled promise rejections when DB pool is saturated.
 *
 * - safeDbCall(asyncFn): wraps DB calls; on throw (connection exhaustion, timeout, etc.)
 *   logs structured and throws DbUnavailableError. Do not leak internal error.
 * - Routes catch DbUnavailableError and return dbUnavailableResponse() (503, stable body).
 * - No route should rethrow raw PostgrestError or Supabase errors.
 */
import { serviceUnavailableResponse } from "@/lib/security/consistentErrors";
import { incrementDbUnavailable } from "@/lib/security/observability";
import type { NextResponse } from "next/server";

export type SafeDbCallContext = {
  route?: string;
  operation?: string;
  table?: string;
};

const LOG_PREFIX = "[db]";

/** Controlled error for DB unavailability. Do not attach internal message. */
export class DbUnavailableError extends Error {
  constructor() {
    super("Database temporarily unavailable.");
    this.name = "DbUnavailableError";
    Object.setPrototypeOf(this, DbUnavailableError.prototype);
  }
}

export function isDbUnavailableError(err: unknown): err is DbUnavailableError {
  return err instanceof DbUnavailableError;
}

/** 503 with stable body for DB exhaustion. Does not leak internal error. */
export function dbUnavailableResponse(): NextResponse {
  return serviceUnavailableResponse();
}

/** Structured log for DB failures. Do not log internal error message (could leak). */
export function logDbError(error: unknown, context: SafeDbCallContext): void {
  const errorType = error instanceof Error ? error.name : "unknown_error";
  const payload = {
    errorType,
    route: context.route ?? "",
    operation: context.operation ?? "",
    table: context.table ?? "",
  };
  try {
    console.error(LOG_PREFIX, JSON.stringify(payload));
  } catch {
    // avoid breaking the request if logging fails
  }
}

/**
 * Wraps an async DB call. On throw (connection exhaustion, timeout, PostgrestError, etc.):
 * logs structured, then throws DbUnavailableError. Caller should return dbUnavailableResponse().
 */
export async function safeDbCall<T>(
  asyncFn: () => Promise<T>,
  context?: SafeDbCallContext,
): Promise<T> {
  try {
    return await asyncFn();
  } catch (err) {
    logDbError(err, context ?? {});
    incrementDbUnavailable();
    throw new DbUnavailableError();
  }
}

/**
 * Run a route handler; on DbUnavailableError return 503 with stable body.
 * Use as: return withDbGuard(async () => { ... your route logic ... });
 */
export async function withDbGuard<T extends Response | NextResponse>(
  fn: () => Promise<T>,
): Promise<T | NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailableResponse();
    throw err;
  }
}
