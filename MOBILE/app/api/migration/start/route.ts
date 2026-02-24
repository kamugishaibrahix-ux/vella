/**
 * Phase M3.5: Start migration tunnel. Sets IN_PROGRESS and returns short-lived token.
 * Export endpoints require this token via X-Migration-Token header.
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { getMigrationState, setMigrationInProgress, setMigrationToken } from "@/lib/migration/state";
import { safeErrorLog } from "@/lib/security/logGuard";

const TOKEN_EXPIRY_MINUTES = 10;

function generateMigrationToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST() {
  try {
    const userIdOr401 = await requireUserId();
    if (userIdOr401 instanceof Response) return userIdOr401;
    const userId = userIdOr401;

    const state = await getMigrationState(userId);
    if (state?.status === "COMPLETED") {
      return NextResponse.json(
        { error: { code: "MIGRATION_ALREADY_COMPLETED", message: "Migration already completed." } },
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    await setMigrationInProgress(userId);
    const token = generateMigrationToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);
    await setMigrationToken(userId, token, expiresAt);

    return NextResponse.json(
      { migration_token: token, expires_in_seconds: TOKEN_EXPIRY_MINUTES * 60 },
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  } catch (err) {
    safeErrorLog("[api/migration/start] error", err);
    return NextResponse.json(
      { error: { code: "start_failed", message: "Failed to start migration." } },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
