"use server";

/**
 * Phase 6B: Deterministic behavioural state engine.
 * Reads from durable Supabase only: profiles, vella_settings, subscriptions,
 * journal_entries, check_ins, conversation_messages, user_goals (if present).
 * No OpenAI. No localStorage.
 */

import type { Database } from "@/lib/supabase/types";
import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert, safeUpsert } from "@/lib/safe/safeSupabaseWrite";

type CurrentInsert = Database["public"]["Tables"]["behavioural_state_current"]["Insert"];
type HistoryInsert = Database["public"]["Tables"]["behavioural_state_history"]["Insert"];

export type SnapshotType = "daily" | "weekly" | "triggered";

export type RecomputeOptions = {
  userId: string;
  snapshotType?: SnapshotType;
  window?: { startISO: string; endISO: string };
  reason?: string;
};

export type RecomputeResult = {
  version: number;
  state: Record<string, unknown>;
  computedAtISO: string;
};

/** State schema (always present). */
export type BehaviouralStateSchema = {
  traits: Record<string, unknown>;
  themes: unknown[];
  loops: unknown[];
  distortions: unknown[];
  progress: Record<string, unknown>;
  connection_depth: number;
  regulation: Record<string, unknown>;
  metadata: { window_start: string; window_end: string; sources: string[] };
};

const EMPTY_STATE: BehaviouralStateSchema = {
  traits: {},
  themes: [],
  loops: [],
  distortions: [],
  progress: {},
  connection_depth: 0,
  regulation: {},
  metadata: { window_start: "", window_end: "", sources: [] },
};

function windowFromOptions(opts: RecomputeOptions): { window_start: string; window_end: string } {
  const now = new Date();
  const endISO = opts.window?.endISO ?? now.toISOString();
  const startISO = opts.window?.startISO ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return { window_start: startISO, window_end: endISO };
}

/**
 * Recompute from durable DB only: profiles, vella_settings, subscriptions,
 * journal_entries, check_ins, conversation_messages, user_goals.
 * Deterministic aggregates (counts, simple progress); no LLM.
 */
export async function recomputeState(opts: RecomputeOptions): Promise<RecomputeResult> {
  const { userId, snapshotType } = opts;
  const now = new Date();
  const computedAtISO = now.toISOString();
  const { window_start, window_end } = windowFromOptions(opts);

  const sources: string[] = [];
  try {
    const [profileRow, settingsRow, subRow] = await Promise.all([
      fromSafe("profiles").select("id").eq("id", userId).maybeSingle(),
      fromSafe("vella_settings").select("user_id").eq("user_id", userId).maybeSingle(),
      fromSafe("subscriptions").select("plan").eq("user_id", userId).maybeSingle(),
    ]);
    if (profileRow.data) sources.push("profiles");
    if (settingsRow.data) sources.push("vella_settings");
    if (subRow.data) sources.push("subscriptions");
  } catch {
    // best-effort
  }

  let journalCount = 0;
  let checkinCount = 0;
  let messageCount = 0;
  let goalsCount = 0;
  const progress: Record<string, unknown> = {};

  try {
    const [journalRes, checkinsRes, metaRows, goalsRes] = await Promise.all([
      fromSafe("journal_entries_v2")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_deleted", false)
        .gte("created_at", window_start)
        .lte("created_at", window_end),
      fromSafe("check_ins_v2")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_deleted", false)
        .gte("created_at", window_start)
        .lte("created_at", window_end),
      fromSafe("conversation_metadata_v2")
        .select("message_count")
        .eq("user_id", userId)
        .gte("started_at", window_start)
        .lte("started_at", window_end),
      fromSafe("user_goals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
    journalCount = (journalRes as { count?: number }).count ?? 0;
    checkinCount = (checkinsRes as { count?: number }).count ?? 0;
    const meta = (metaRows.data ?? []) as { message_count: number }[];
    messageCount = meta.reduce((s, r) => s + (r.message_count ?? 0), 0);
    goalsCount = (goalsRes as { count?: number }).count ?? 0;
    if (journalCount > 0) sources.push("journal_entries_v2");
    if (checkinCount > 0) sources.push("check_ins_v2");
    if (messageCount > 0) sources.push("conversation_metadata_v2");
    if (goalsCount > 0) sources.push("user_goals");
  } catch {
    // best-effort; counts stay 0
  }

  progress.journal_count = journalCount;
  progress.checkin_count = checkinCount;
  progress.message_count = messageCount;
  progress.goals_count = goalsCount;
  const connection_depth = Math.min(10, Math.floor(messageCount / 5));

  const state: BehaviouralStateSchema = {
    ...EMPTY_STATE,
    progress,
    connection_depth,
    metadata: {
      window_start,
      window_end,
      sources,
    },
  };

  const currentRow = await fromSafe("behavioural_state_current")
    .select("version, state_json")
    .eq("user_id", userId)
    .maybeSingle();

  const existing = currentRow.data as { version: number } | null | undefined;
  const version = (existing?.version ?? 0) + 1;

  const currentPayload: CurrentInsert = {
    user_id: userId,
    version,
    state_json: state as Database["public"]["Tables"]["behavioural_state_current"]["Row"]["state_json"],
    last_computed_at: computedAtISO,
    updated_at: computedAtISO,
  };
  if (!supabaseAdmin) {
    throw new Error("Supabase admin not configured.");
  }
  await safeUpsert(
    "behavioural_state_current",
    currentPayload as Record<string, unknown>,
    { onConflict: "user_id" },
    supabaseAdmin,
  );

  if (snapshotType) {
    const historyPayload: HistoryInsert = {
      user_id: userId,
      version,
      snapshot_type: snapshotType,
      state_json: state as Database["public"]["Tables"]["behavioural_state_history"]["Row"]["state_json"],
      created_at: computedAtISO,
    };
    await safeInsert("behavioural_state_history", historyPayload as Record<string, unknown>, undefined, supabaseAdmin);
  }

  return {
    version,
    state: state as unknown as Record<string, unknown>,
    computedAtISO,
  };
}
