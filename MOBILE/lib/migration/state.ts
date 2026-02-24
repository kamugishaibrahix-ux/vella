/**
 * Phase M2 Patch: per-user migration state.
 * Server uses supabaseAdmin (service_role) for all reads/writes.
 * Export endpoints allowed only when status !== COMPLETED.
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";

export type MigrationStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type MigrationStateRow = {
  user_id: string;
  status: MigrationStatus;
  started_at: string | null;
  completed_at: string | null;
  checksum: string | null;
  updated_at: string;
  migration_token: string | null;
  migration_token_expires_at: string | null;
};

type Row = Database["public"]["Tables"]["migration_state"]["Row"];

function toStatus(s: string | null): MigrationStatus {
  if (s === "NOT_STARTED" || s === "IN_PROGRESS" || s === "COMPLETED") return s;
  return "NOT_STARTED";
}

export async function getMigrationState(userId: string): Promise<MigrationStateRow | null> {
  const { data, error } = await fromSafe("migration_state")
    .select("user_id, status, started_at, completed_at, checksum, updated_at, migration_token, migration_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Row;
  return {
    user_id: r.user_id,
    status: toStatus(r.status),
    started_at: r.started_at,
    completed_at: r.completed_at,
    checksum: r.checksum,
    updated_at: r.updated_at,
    migration_token: r.migration_token ?? null,
    migration_token_expires_at: r.migration_token_expires_at ?? null,
  };
}

/** Validate that the given token matches the user's current migration token and is not expired. */
export async function validateMigrationToken(userId: string, token: string | null): Promise<boolean> {
  if (!token || token.length < 16) return false;
  const state = await getMigrationState(userId);
  if (!state?.migration_token || !state.migration_token_expires_at) return false;
  if (state.migration_token !== token) return false;
  try {
    const expiresAt = new Date(state.migration_token_expires_at).getTime();
    if (expiresAt <= Date.now()) return false;
  } catch {
    return false;
  }
  return true;
}

/** Set a short-lived migration token (e.g. 10 min). Used by POST /api/migration/start. */
export async function setMigrationToken(userId: string, token: string, expiresAt: Date): Promise<void> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const now = new Date().toISOString();
  const { error } = await safeUpdate(
    "migration_state",
    {
      migration_token: token,
      migration_token_expires_at: expiresAt.toISOString(),
      updated_at: now,
    } as Record<string, unknown>,
    undefined,
    supabaseAdmin
  )
    .eq("user_id", userId);
  if (error) throw error;
}

/** Set status to IN_PROGRESS and started_at if not set. Idempotent. */
export async function setMigrationInProgress(userId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const now = new Date().toISOString();
  const existing = await getMigrationState(userId);
  if (existing) {
    const updates: Record<string, unknown> = { status: "IN_PROGRESS", updated_at: now };
    if (!existing.started_at) updates.started_at = now;
    const { error } = await safeUpdate(
      "migration_state",
      updates,
      undefined,
      supabaseAdmin
    )
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await safeInsert(
    "migration_state",
    {
      user_id: userId,
      status: "IN_PROGRESS",
      started_at: now,
      updated_at: now,
    } as Record<string, unknown>,
    undefined,
    supabaseAdmin
  );
  if (error) throw error;
}

/** Set status to COMPLETED. Server-authoritative. */
export async function setMigrationCompleted(userId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const now = new Date().toISOString();
  const existing = await getMigrationState(userId);
  const payload: Record<string, unknown> = {
    status: "COMPLETED",
    completed_at: now,
    updated_at: now,
  };
  if (existing) {
    const { error } = await safeUpdate("migration_state", payload, undefined, supabaseAdmin)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await safeInsert(
    "migration_state",
    { user_id: userId, ...payload } as Record<string, unknown>,
    undefined,
    supabaseAdmin
  );
  if (error) throw error;
}

export function migrationRequiredResponse(status: MigrationStatus, requestId?: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: "MIGRATION_REQUIRED",
        message: "Data migration required. Use export endpoints then complete migration.",
        request_id: requestId ?? null,
      },
      migration: {
        status,
        next_step: "export_legacy" as const,
      },
    }),
    { status: 409, headers: { "Content-Type": "application/json" } }
  );
}
