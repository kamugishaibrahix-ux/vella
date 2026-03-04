/**
 * Pure deterministic governance computation functions.
 * Extracted from stateEngine.ts for shared use by both server and local-mode insights.
 * No Supabase. No "use server". No I/O. Pure functions only.
 */

const RECOVERY_CODES = ["ok", "at_risk", "relapse", "na"] as const;
const DISCIPLINE_CODES = ["on_track", "slipping", "off_track", "na"] as const;
const FOCUS_CODES = ["active", "idle", "overdue", "na"] as const;

export type RecoveryState = (typeof RECOVERY_CODES)[number];
export type DisciplineState = (typeof DISCIPLINE_CODES)[number];
export type FocusState = (typeof FOCUS_CODES)[number];

export function computeRecoveryState(
  activeAbstinenceCount: number,
  abstinenceViolations7d: number
): RecoveryState {
  if (activeAbstinenceCount === 0) return "na";
  if (abstinenceViolations7d === 0) return "ok";
  if (abstinenceViolations7d <= 2) return "at_risk";
  return "relapse";
}

export function computeDisciplineState(
  activeCommitmentsCount: number,
  violations7d: number,
  completed7d: number
): DisciplineState {
  if (activeCommitmentsCount === 0) return "na";
  if (violations7d === 0) return "on_track";
  if (violations7d <= 2 && completed7d >= violations7d) return "on_track";
  if (violations7d <= 2) return "slipping";
  return "off_track";
}

export function computeFocusState(
  sessionsLast30d: number,
  completedSessions7d: number,
  focusStartNoEnd7d: number
): FocusState {
  if (completedSessions7d > 0) return "active";
  if (focusStartNoEnd7d > 0) return "overdue";
  if (sessionsLast30d === 0) return "na";
  return "idle";
}

export function computeGovernanceRiskScore(
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

export function computeEscalationLevel(governance_risk_score: number): number {
  if (governance_risk_score <= 2) return 0;
  if (governance_risk_score <= 4) return 1;
  if (governance_risk_score <= 7) return 2;
  return 3;
}
