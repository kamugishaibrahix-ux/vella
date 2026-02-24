/**
 * Phase M3.5: Dedicated migration status endpoint. Metadata only; no user text.
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { getMigrationState } from "@/lib/migration/state";
import { getHasLegacy } from "@/lib/migration/legacyCounts";
import { safeErrorLog } from "@/lib/security/logGuard";

export type MigrationStatusResponse = {
  migration: { status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" };
  has_legacy: { journals: boolean; checkins: boolean; conversations: boolean; reports: boolean; memory: boolean };
  required: boolean;
  request_id: string | null;
};

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const userIdOr401 = await requireUserId();
    if (userIdOr401 instanceof Response) return userIdOr401;
    const userId = userIdOr401;

    const [state, has_legacy] = await Promise.all([
      getMigrationState(userId),
      getHasLegacy(userId),
    ]);

    const status = state?.status ?? "NOT_STARTED";
    const required =
      (has_legacy.journals || has_legacy.checkins || has_legacy.conversations || has_legacy.reports || has_legacy.memory) &&
      status !== "COMPLETED";

    const body: MigrationStatusResponse = {
      migration: { status },
      has_legacy,
      required,
      request_id: requestId,
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (err) {
    safeErrorLog("[api/migration/status] error", err);
    return NextResponse.json(
      { error: { code: "status_failed", message: "Migration status check failed", request_id: requestId } },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
