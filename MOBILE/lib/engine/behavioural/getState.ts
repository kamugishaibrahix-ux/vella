"use server";

import { fromSafe } from "@/lib/supabase/admin";
import { recomputeState } from "./recomputeState";

const COOLDOWN_MS = 60_000;

export type StateRow = {
  version: number;
  state: Record<string, unknown>;
  lastComputedAt: string | null;
  updatedAt: string | null;
};

/**
 * Read current behavioural state from DB. Returns null if no row.
 */
export async function getBehaviouralStateForUser(userId: string): Promise<StateRow | null> {
  const { data, error } = await fromSafe("behavioural_state_current")
    .select("version, state_json, last_computed_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as { version: number; state_json: unknown; last_computed_at: string | null; updated_at: string | null };
  return {
    version: row.version ?? 0,
    state: (row.state_json as Record<string, unknown>) ?? {},
    lastComputedAt: row.last_computed_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * If no row or last_computed_at older than COOLDOWN_MS, call recomputeState once.
 * Prevents stampede.
 */
export async function tryRecomputeWithCooldown(userId: string): Promise<void> {
  const { data } = await fromSafe("behavioural_state_current")
    .select("last_computed_at")
    .eq("user_id", userId)
    .maybeSingle();

  const row = data as { last_computed_at: string | null } | null;
  const lastAt = row?.last_computed_at;
  if (lastAt) {
    const elapsed = Date.now() - new Date(lastAt).getTime();
    if (elapsed < COOLDOWN_MS) return;
  }

  await recomputeState({ userId, reason: "cooldown_refresh" }).catch(() => {});
}
