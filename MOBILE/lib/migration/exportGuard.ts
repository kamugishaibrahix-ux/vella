/**
 * Phase M2/M3.5: Guard for migration export endpoints.
 * Export allowed only when migration_state.status !== COMPLETED and valid X-Migration-Token.
 * Never log response bodies.
 */

import { NextResponse } from "next/server";
import { getMigrationState, setMigrationInProgress, validateMigrationToken } from "@/lib/migration/state";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";

/** Hard rate limit for export: 5 requests per 60s per user per export type. */
export const EXPORT_RATE_LIMIT = { limit: 5, window: 60 };

export const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export type ExportGuardResult = { userId: string; requestId: string } | Response;

export async function guardMigrationExport(
  request: Request,
  rateLimitKey: string
): Promise<ExportGuardResult> {
  const requestId = crypto.randomUUID();
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({
      key: `migration_export:${rateLimitKey}:${userId}`,
      limit: EXPORT_RATE_LIMIT.limit,
      window: EXPORT_RATE_LIMIT.window,
      routeKey: "migration_export",
    });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  const state = await getMigrationState(userId);
  if (state?.status === "COMPLETED") {
    return NextResponse.json(
      { error: { code: "MIGRATION_ALREADY_COMPLETED", message: "Export not available after migration is completed." } },
      { status: 403, headers: { ...NO_CACHE_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const migrationToken = request.headers.get("x-migration-token")?.trim() ?? null;
  const valid = await validateMigrationToken(userId, migrationToken);
  if (!valid) {
    return NextResponse.json(
      { error: { code: "MIGRATION_TOKEN_REQUIRED", message: "Call POST /api/migration/start first and pass X-Migration-Token header.", request_id: requestId } },
      { status: 401, headers: { ...NO_CACHE_HEADERS, "Content-Type": "application/json" } }
    );
  }

  await setMigrationInProgress(userId);
  return { userId, requestId };
}
