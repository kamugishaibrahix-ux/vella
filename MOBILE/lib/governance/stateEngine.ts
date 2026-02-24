/**
 * Governance State Engine (deterministic only).
 * Computes recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level
 * from behaviour_events, commitments, abstinence_targets, focus_sessions.
 * No AI. No reflection. Pure rules. Upserts governance_state only.
 * Does not modify behavioural_state_current.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeUpsert } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import { validateGovernancePayload } from "@/lib/governance/validation";

type GovernanceStateInsert = Database["public"]["Tables"]["governance_state"]["Insert"];

const LOOKBACK_DAYS = 30;
const LOOKBACK_DAYS_STRICT = 7;
const MAX_EVENTS_READ = 500;

/** Recovery state: abstinence / relapse risk (codes only). */
const RECOVERY_CODES = ["ok", "at_risk", "relapse", "na"] as const;

/** Discipline state: commitment adherence (codes only). */
const DISCIPLINE_CODES = ["on_track", "slipping", "off_track", "na"] as const;

/** Focus state: focus session activity (codes only). */
const FOCUS_CODES = ["active", "idle", "overdue", "na"] as const;

export type ComputeGovernanceStateResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Deterministic governance state computation.
 * Reads behaviour_events, commitments, abstinence_targets, focus_sessions.
 * Outputs recovery_state, discipline_state, focus_state, governance_risk_score, escalation_level.
 * Upserts into governance_state. Does not touch behavioural_state_current.
 */
export async function computeGovernanceState(
  userId: string
): Promise<ComputeGovernanceStateResult> {
  const now = new Date();
  const nowISO = now.toISOString();
  const windowStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const windowStartStrict = new Date(now.getTime() - LOOKBACK_DAYS_STRICT * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [eventsRes, commitmentsRes, abstinenceRes, focusRes] = await Promise.all([
      fromSafe("behaviour_events")
        .select("id, event_type, occurred_at, subject_code")
        .eq("user_id", userId)
        .gte("occurred_at", windowStart)
        .order("occurred_at", { ascending: false })
        .limit(MAX_EVENTS_READ),
      fromSafe("commitments")
        .select("id, commitment_code, status, start_at, end_at")
        .eq("user_id", userId)
        .eq("status", "active"),
      fromSafe("abstinence_targets")
        .select("id, abstinence_target_code, status, start_at")
        .eq("user_id", userId)
        .eq("status", "active"),
      fromSafe("focus_sessions")
        .select("id, started_at, ended_at, duration_seconds, outcome_code")
        .eq("user_id", userId)
        .gte("started_at", windowStart)
        .order("started_at", { ascending: false }),
    ]);

    const events = (eventsRes.data ?? []) as Array<{ event_type: string; occurred_at: string }>;
    const commitments = commitmentsRes.data ?? [];
    const abstinence = abstinenceRes.data ?? [];
    const focusSessions = focusRes.data ?? [];

    const eventsLast7d = events.filter((e) => e.occurred_at >= windowStartStrict);

    const abstinenceViolations7d = eventsLast7d.filter(
      (e) => e.event_type === "abstinence_violation"
    ).length;
    const commitmentViolations7d = eventsLast7d.filter(
      (e) => e.event_type === "commitment_violation"
    ).length;
    const commitmentCompleted7d = eventsLast7d.filter(
      (e) => e.event_type === "commitment_completed"
    ).length;
    const focusEndCompleted7d = focusSessions.filter(
      (s) => {
        const session = s as { started_at: string; outcome_code: string };
        return session.started_at >= windowStartStrict && session.outcome_code === "completed";
      }
    ).length;
    const focusStartNoEnd7d = eventsLast7d.filter((e) => e.event_type === "focus_start").length
      - eventsLast7d.filter((e) => e.event_type === "focus_end").length;

    const recovery_state = computeRecoveryState(abstinence.length, abstinenceViolations7d);
    const discipline_state = computeDisciplineState(
      commitments.length,
      commitmentViolations7d,
      commitmentCompleted7d
    );
    const focus_state = computeFocusState(
      focusSessions.length,
      focusEndCompleted7d,
      focusStartNoEnd7d
    );
    const governance_risk_score = computeGovernanceRiskScore(
      abstinenceViolations7d,
      commitmentViolations7d,
      focus_state,
      focusSessions.length
    );
    const escalation_level = computeEscalationLevel(governance_risk_score);

    const state_json: Record<string, number | string> = {
      recovery_state,
      discipline_state,
      focus_state,
      governance_risk_score,
      escalation_level,
      last_computed_at_iso: nowISO,
    };

    const payload = {
      user_id: userId,
      state_json,
      last_computed_at: nowISO,
      updated_at: nowISO,
    };

    validateGovernancePayload("GovernanceStateUpdate", payload);

    const row: GovernanceStateInsert = {
      user_id: userId,
      state_json: state_json as Database["public"]["Tables"]["governance_state"]["Row"]["state_json"],
      last_computed_at: nowISO,
      updated_at: nowISO,
    };

    if (!supabaseAdmin) {
      return { success: false, error: "Supabase admin not configured." };
    }
    const { error } = await safeUpsert("governance_state", row, {
      onConflict: "user_id",
    }, supabaseAdmin);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

function computeRecoveryState(
  activeAbstinenceCount: number,
  abstinenceViolations7d: number
): (typeof RECOVERY_CODES)[number] {
  if (activeAbstinenceCount === 0) return "na";
  if (abstinenceViolations7d === 0) return "ok";
  if (abstinenceViolations7d <= 2) return "at_risk";
  return "relapse";
}

function computeDisciplineState(
  activeCommitmentsCount: number,
  violations7d: number,
  completed7d: number
): (typeof DISCIPLINE_CODES)[number] {
  if (activeCommitmentsCount === 0) return "na";
  if (violations7d === 0) return "on_track";
  if (violations7d <= 2 && completed7d >= violations7d) return "on_track";
  if (violations7d <= 2) return "slipping";
  return "off_track";
}

function computeFocusState(
  sessionsLast30d: number,
  completedSessions7d: number,
  focusStartNoEnd7d: number
): (typeof FOCUS_CODES)[number] {
  if (completedSessions7d > 0) return "active";
  if (focusStartNoEnd7d > 0) return "overdue";
  if (sessionsLast30d === 0) return "na";
  return "idle";
}

function computeGovernanceRiskScore(
  abstinenceViolations7d: number,
  commitmentViolations7d: number,
  focus_state: string,
  focusSessionsLast30d: number
): number {
  let score = 0;
  score += Math.min(abstinenceViolations7d * 2, 6);
  score += Math.min(commitmentViolations7d * 2, 6);
  if (focus_state === "idle" && focusSessionsLast30d > 0) score += 1;
  if (focus_state === "overdue") score += 2;
  return Math.min(score, 10);
}

function computeEscalationLevel(governance_risk_score: number): number {
  if (governance_risk_score <= 2) return 0;
  if (governance_risk_score <= 4) return 1;
  if (governance_risk_score <= 7) return 2;
  return 3;
}
