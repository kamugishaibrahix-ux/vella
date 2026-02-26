/**
 * Execution Spine — Outcome logging via behaviour_events.
 * Writes commitment outcomes (completed/skipped/missed) as append-only events.
 * Metadata-only. Does NOT modify governance_state directly.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import type { OutcomeCode } from "./types";

type BehaviourEventInsert = Database["public"]["Tables"]["behaviour_events"]["Insert"];
type BehaviourEventRow = Database["public"]["Tables"]["behaviour_events"]["Row"];

// ---------------------------------------------------------------------------
// Log outcome
// ---------------------------------------------------------------------------

export type LogOutcomeParams = {
  userId: string;
  commitmentId: string;
  outcomeCode: OutcomeCode;
  occurredAt?: string;
  windowStart?: string;
  windowEnd?: string;
};

export type LogOutcomeResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function logOutcome(params: LogOutcomeParams): Promise<LogOutcomeResult> {
  if (!supabaseAdmin) {
    return { success: false, error: "Supabase admin not configured." };
  }

  const occurred_at = params.occurredAt ?? new Date().toISOString();

  const metadata: Record<string, string | number> = {
    outcome_code: params.outcomeCode,
    commitment_id: params.commitmentId,
  };
  if (params.windowStart) metadata.window_start = params.windowStart;
  if (params.windowEnd) metadata.window_end = params.windowEnd;

  const row: BehaviourEventInsert = {
    user_id: params.userId,
    event_type: "commitment_outcome_logged",
    occurred_at,
    commitment_id: params.commitmentId,
    metadata: metadata as Database["public"]["Tables"]["behaviour_events"]["Row"]["metadata"],
  };

  const { data, error } = await safeInsert(
    "behaviour_events",
    row as Record<string, unknown>,
    undefined,
    supabaseAdmin
  ).select("id").single();

  if (error) return { success: false, error: error.message };
  if (!data?.id) return { success: false, error: "Insert did not return id" };
  return { success: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Query outcomes for a commitment (last N days)
// ---------------------------------------------------------------------------

export async function getOutcomeEvents(
  userId: string,
  commitmentId: string,
  lookbackDays: number = 7
): Promise<{ events: BehaviourEventRow[]; error?: string }> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await fromSafe("behaviour_events")
    .select("*")
    .eq("user_id", userId)
    .eq("event_type", "commitment_outcome_logged")
    .eq("commitment_id", commitmentId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(100);

  if (error) return { events: [], error: error.message };
  return { events: (data ?? []) as BehaviourEventRow[] };
}
