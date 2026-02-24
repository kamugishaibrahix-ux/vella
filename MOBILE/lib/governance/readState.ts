/**
 * Governance state reader for Hybrid Coupling v1.
 * Reads already-computed governance_state only. Does not compute state.
 * Server-only (used from API routes); no "use server" so sync helpers are allowed.
 */

import { fromSafe } from "@/lib/supabase/admin";

export type GovernanceStateForUser = {
  riskScore: number;
  escalationLevel: number;
  recoveryState: string;
  disciplineState: string;
  focusState: string;
  /** ISO timestamp from state_json.last_computed_at_iso; absent if no row or missing key. */
  lastComputedAtIso: string | null;
};

const DEFAULTS: GovernanceStateForUser = {
  riskScore: 0,
  escalationLevel: 0,
  recoveryState: "na",
  disciplineState: "na",
  focusState: "na",
  lastComputedAtIso: null,
};

/** Default TTL for governance state freshness (6 hours). Recompute if older. */
export const GOVERNANCE_STATE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * True if governance state is missing or older than ttlMs.
 */
export function isGovernanceStale(governance: GovernanceStateForUser, ttlMs: number = GOVERNANCE_STATE_TTL_MS): boolean {
  if (!governance.lastComputedAtIso) return true;
  const computedAt = Date.parse(governance.lastComputedAtIso);
  if (Number.isNaN(computedAt)) return true;
  return Date.now() - computedAt > ttlMs;
}

/**
 * Read governance_state for a user. Returns safe defaults if no row exists.
 * Do not use this to compute state; use computeGovernanceState (stateEngine) for that.
 */
export async function getGovernanceStateForUser(userId: string): Promise<GovernanceStateForUser> {
  const { data, error } = await fromSafe("governance_state")
    .select("state_json")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULTS };
  }

  const state = (data as { state_json?: Record<string, unknown> }).state_json;
  if (!state || typeof state !== "object") {
    return { ...DEFAULTS };
  }

  const lastComputedAtIso =
    typeof state.last_computed_at_iso === "string" && state.last_computed_at_iso
      ? state.last_computed_at_iso
      : null;

  return {
    riskScore: typeof state.governance_risk_score === "number" ? state.governance_risk_score : DEFAULTS.riskScore,
    escalationLevel: typeof state.escalation_level === "number" ? state.escalation_level : DEFAULTS.escalationLevel,
    recoveryState: typeof state.recovery_state === "string" ? state.recovery_state : DEFAULTS.recoveryState,
    disciplineState: typeof state.discipline_state === "string" ? state.discipline_state : DEFAULTS.disciplineState,
    focusState: typeof state.focus_state === "string" ? state.focus_state : DEFAULTS.focusState,
    lastComputedAtIso,
  };
}

const LOOKBACK_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LOOKBACK_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Read-only: count commitment_violation, abstinence_violation, commitment_completed in last 7 days.
 * Used for behaviour snapshot and guidance. No free text.
 */
export async function getRecentViolationCounts(userId: string): Promise<{
  commitmentViolations: number;
  abstinenceViolations: number;
  commitmentCompleted: number;
}> {
  const windowStart = new Date(Date.now() - LOOKBACK_7_DAYS_MS).toISOString();
  const { data, error } = await fromSafe("behaviour_events")
    .select("event_type")
    .eq("user_id", userId)
    .gte("occurred_at", windowStart);

  if (error) {
    return { commitmentViolations: 0, abstinenceViolations: 0, commitmentCompleted: 0 };
  }

  const events = (data ?? []) as Array<{ event_type: string }>;
  const commitmentViolations = events.filter((e) => e.event_type === "commitment_violation").length;
  const abstinenceViolations = events.filter((e) => e.event_type === "abstinence_violation").length;
  const commitmentCompleted = events.filter((e) => e.event_type === "commitment_completed").length;
  return { commitmentViolations, abstinenceViolations, commitmentCompleted };
}

/**
 * Read-only: count focus_sessions that started in last 7 days.
 * Metadata only (id, started_at). No content.
 */
export async function getFocusSessionsCountLast7d(userId: string): Promise<number> {
  const windowStart = new Date(Date.now() - LOOKBACK_7_DAYS_MS).toISOString();
  const { data, error } = await fromSafe("focus_sessions")
    .select("id")
    .eq("user_id", userId)
    .gte("started_at", windowStart);

  if (error) return 0;
  return (data ?? []).length;
}

/**
 * Read-only: counts in last 30 days for longitudinal trends.
 * No free text.
 */
export async function getViolationAndCompletionCounts30d(userId: string): Promise<{
  commitmentViolations30d: number;
  abstinenceViolations30d: number;
  commitmentCompleted30d: number;
}> {
  const windowStart = new Date(Date.now() - LOOKBACK_30_DAYS_MS).toISOString();
  const { data, error } = await fromSafe("behaviour_events")
    .select("event_type")
    .eq("user_id", userId)
    .gte("occurred_at", windowStart);

  if (error) {
    return { commitmentViolations30d: 0, abstinenceViolations30d: 0, commitmentCompleted30d: 0 };
  }
  const events = (data ?? []) as Array<{ event_type: string }>;
  return {
    commitmentViolations30d: events.filter((e) => e.event_type === "commitment_violation").length,
    abstinenceViolations30d: events.filter((e) => e.event_type === "abstinence_violation").length,
    commitmentCompleted30d: events.filter((e) => e.event_type === "commitment_completed").length,
  };
}

/**
 * Read-only: focus_sessions count in last 30 days.
 */
export async function getFocusSessionsCountLast30d(userId: string): Promise<number> {
  const windowStart = new Date(Date.now() - LOOKBACK_30_DAYS_MS).toISOString();
  const { data, error } = await fromSafe("focus_sessions")
    .select("id")
    .eq("user_id", userId)
    .gte("started_at", windowStart);
  if (error) return 0;
  return (data ?? []).length;
}

/**
 * Read-only: weekly commitment_violation counts for last 4 weeks (oldest to newest).
 * [week1, week2, week3, week4] where week1 = 21–30 days ago, week4 = 0–7 days ago.
 */
export async function getPriorViolationTrendSnapshot(userId: string): Promise<number[]> {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const { data, error } = await fromSafe("behaviour_events")
    .select("event_type, occurred_at")
    .eq("user_id", userId)
    .gte("occurred_at", new Date(now - 4 * weekMs).toISOString());

  if (error) return [];
  const events = (data ?? []) as Array<{ event_type: string; occurred_at: string }>;
  const violations = events.filter((e) => e.event_type === "commitment_violation");
  const byWeek: number[] = [0, 0, 0, 0]; // 0 = 0–7d ago, 3 = 21–30d ago
  for (const v of violations) {
    const t = new Date(v.occurred_at).getTime();
    const weeksAgo = (now - t) / weekMs;
    const bucket = Math.floor(weeksAgo);
    if (bucket >= 0 && bucket <= 3) byWeek[bucket]++;
  }
  return [byWeek[3], byWeek[2], byWeek[1], byWeek[0]]; // oldest to newest
}

export type ActiveCommitmentMetadata = {
  id: string;
  subject_code: string | null;
  created_at: string;
};

/**
 * Read-only: active commitments for user (metadata only).
 * Selects id, subject_code, created_at. No free text. Used for contradiction detection.
 */
export async function getActiveCommitmentsMetadata(userId: string): Promise<ActiveCommitmentMetadata[]> {
  const { data, error } = await fromSafe("commitments")
    .select("id, subject_code, created_at")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) return [];
  return (data ?? []) as ActiveCommitmentMetadata[];
}
