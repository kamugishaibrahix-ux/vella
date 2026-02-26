/**
 * Weekly focus review — aggregate weekly_focus_checkin events.
 * Deterministic. No free text. Server-only.
 */

import { fromSafe } from "@/lib/supabase/admin";
import { getWeekBounds } from "./weekId";
import { suggestWeeklyFocusItems } from "./focusEngine";
import { buildFocusInputForUser } from "./buildFocusInput";
import type { WeeklyFocusItem } from "./focusEngine";

/** Allowlisted reason codes for earned validation in review. */
export const REVIEW_EARNED_VALIDATION_REASONS = [
  "CONSISTENT_FOCUS_WEEK",
  "CONSISTENT_COMPLETIONS_7D",
  "ZERO_VIOLATIONS_7D",
  "FOCUS_ON_TRACK",
] as const;

/** Allowlisted reason codes for weekly review disqualification (escalation/boundary). */
export const WEEKLY_REVIEW_REASON_CODES = [
  "ESCALATION_PRESENT",
  "BOUNDARY_TENSION_PRESENT",
] as const;

export type WeeklyFocusReviewResult = {
  weekId: string;
  completionScore0to100: number;
  checkinCount: number;
  submittedToday: boolean;
  strongestSubjectCode: string | null;
  weakestSubjectCode: string | null;
  consistencyTier: "steady" | "mixed" | "fragile";
  earnedValidationEligible: boolean;
  earnedValidationReasons: string[];
  suggestedNextWeek: WeeklyFocusItem[];
};

/**
 * Fetch weekly_focus_checkin events for user in the given week.
 * Filters by metadata.week_id in code (no JSON query).
 */
export async function getWeeklyFocusCheckinEvents(
  userId: string,
  weekId: string
): Promise<
  Array<{
    subject_code: string;
    numeric_value: number;
    metadata: Record<string, unknown>;
    occurred_at: string;
  }>
> {
  const bounds = getWeekBounds(weekId);
  if (!bounds) return [];

  const { data, error } = await fromSafe("behaviour_events")
    .select("subject_code, metadata, occurred_at")
    .eq("user_id", userId)
    .eq("event_type", "weekly_focus_checkin")
    .gte("occurred_at", bounds.startIso)
    .lt("occurred_at", bounds.endIso);

  if (error) return [];
  const rows = (data ?? []) as Array<{
    subject_code: string | null;
    metadata: unknown;
    occurred_at: string | null;
  }>;
  const out: Array<{
    subject_code: string;
    numeric_value: number;
    metadata: Record<string, unknown>;
    occurred_at: string;
  }> = [];
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (meta.week_id !== weekId) continue;
    const sub = r.subject_code ?? "other";
    const num = typeof meta.numeric_value === "number" ? meta.numeric_value : 0;
    const occurred_at = r.occurred_at ?? new Date().toISOString();
    out.push({ subject_code: sub, numeric_value: num, metadata: meta, occurred_at });
  }
  return out;
}

export type WeeklyEscalationBoundarySignals = {
  hasHighEscalation: boolean;
  hasSevereBoundary: boolean;
};

/**
 * Weekly escalation/boundary signals for earned-validation eligibility.
 * Weekly escalationLevel >= 2 and boundarySeverity === 2 are not stored as behaviour_events
 * in the current schema (escalation comes from governance_state; boundary is runtime snapshot).
 * Eligibility is therefore limited to rating threshold (avg >= 1.5) until such weekly signals
 * are recorded. When they are, query behaviour_events for the week and set flags from
 * numeric_value (e.g. escalation_level, boundary_severity in metadata).
 */
export async function getWeeklyEscalationAndBoundarySignals(
  _userId: string,
  _weekId: string
): Promise<WeeklyEscalationBoundarySignals> {
  return { hasHighEscalation: false, hasSevereBoundary: false };
}

/** Event shape for aggregation: requires occurred_at and item_id for daily-cap scoring. */
export type WeeklyFocusCheckinEvent = {
  subject_code: string;
  numeric_value: number;
  occurred_at: string;
  item_id: string;
};

const DAILY_MAX = 100 / 7;

/**
 * Extract UTC date YYYY-MM-DD from ISO timestamp.
 */
function toUtcDateOnly(occurredAt: string): string {
  const d = new Date(occurredAt);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Aggregate events into completion score (daily-cap model), strongest/weakest subject, tier, earned validation.
 * Percentage: 7 days, each day max 100/7; per item per day (100/7)/N; strong=full, neutral=50%, struggling=0; cap at 100%.
 * earnedValidationEligible and consistencyTier still use event average (unchanged).
 */
export function aggregateWeeklyFocusCheckins(
  events: WeeklyFocusCheckinEvent[],
  signals?: WeeklyEscalationBoundarySignals
): {
  completionScore0to100: number;
  strongestSubjectCode: string | null;
  weakestSubjectCode: string | null;
  consistencyTier: "steady" | "mixed" | "fragile";
  earnedValidationEligible: boolean;
  earnedValidationReasons: string[];
} {
  const hasHighEscalation = signals?.hasHighEscalation ?? false;
  const hasSevereBoundary = signals?.hasSevereBoundary ?? false;

  if (events.length === 0) {
    return {
      completionScore0to100: 0,
      strongestSubjectCode: null,
      weakestSubjectCode: null,
      consistencyTier: "fragile",
      earnedValidationEligible: false,
      earnedValidationReasons: [],
    };
  }

  // Step A — Group by day (UTC date only)
  const byDay = new Map<string, WeeklyFocusCheckinEvent[]>();
  for (const e of events) {
    const dateKey = toUtcDateOnly(e.occurred_at);
    const list = byDay.get(dateKey) ?? [];
    list.push(e);
    byDay.set(dateKey, list);
  }

  // Step B — N = unique itemIds in the week
  const uniqueItemIds = new Set(events.map((e) => e.item_id));
  const N = uniqueItemIds.size || 1;

  // Step C — Daily max and per-item daily max
  const itemDailyMax = DAILY_MAX / N;

  // Step D & E — Per event: weight by numeric_value (2→1, 1→2/3, 0→1/3); contribution = weight * itemDailyMax. Sum per day, cap day at DAILY_MAX
  let weeklyTotal = 0;
  for (const dayEvents of Array.from(byDay.values())) {
    let daySum = 0;
    for (const e of dayEvents) {
      let ratingWeight = 0;
      if (e.numeric_value === 2) ratingWeight = 1;
      if (e.numeric_value === 1) ratingWeight = 2 / 3;
      if (e.numeric_value === 0) ratingWeight = 1 / 3;
      const contribution = ratingWeight * itemDailyMax;
      daySum += contribution;
    }
    weeklyTotal += Math.min(daySum, DAILY_MAX);
  }

  // Step F — Clamp weekly total to 100 and round
  weeklyTotal = Math.min(weeklyTotal, 100);
  const completionScore0to100 = Math.round(weeklyTotal);

  // Strongest/weakest and tier/earned validation: keep existing logic using event average
  const totalSum = events.reduce((s, e) => s + e.numeric_value, 0);
  const totalCount = events.length;
  const avg = totalSum / totalCount;

  const bySubject = new Map<string, { sum: number; count: number }>();
  for (const e of events) {
    const cur = bySubject.get(e.subject_code) ?? { sum: 0, count: 0 };
    cur.sum += e.numeric_value;
    cur.count += 1;
    bySubject.set(e.subject_code, cur);
  }

  let strongestSubjectCode: string | null = null;
  let weakestSubjectCode: string | null = null;
  let maxAvg = -1;
  let minAvg = 3;
  bySubject.forEach(({ sum, count }, code) => {
    const a = sum / count;
    if (a > maxAvg) {
      maxAvg = a;
      strongestSubjectCode = code;
    }
    if (a < minAvg) {
      minAvg = a;
      weakestSubjectCode = code;
    }
  });

  let consistencyTier: "steady" | "mixed" | "fragile" = "fragile";
  if (avg >= 1.6) consistencyTier = "steady";
  else if (avg >= 0.8) consistencyTier = "mixed";

  const earnedValidationEligible =
    avg >= 1.5 && !hasHighEscalation && !hasSevereBoundary;
  const earnedValidationReasons: string[] = [];
  if (!earnedValidationEligible) {
    if (hasHighEscalation) earnedValidationReasons.push("ESCALATION_PRESENT");
    if (hasSevereBoundary) earnedValidationReasons.push("BOUNDARY_TENSION_PRESENT");
  } else if (avg >= 1.6) {
    earnedValidationReasons.push("CONSISTENT_FOCUS_WEEK");
  }

  return {
    completionScore0to100,
    strongestSubjectCode,
    weakestSubjectCode,
    consistencyTier,
    earnedValidationEligible,
    earnedValidationReasons,
  };
}

/**
 * Full review for a week: aggregate + suggested next week.
 */
export async function getWeeklyFocusReview(
  userId: string,
  weekId: string
): Promise<WeeklyFocusReviewResult | null> {
  const bounds = getWeekBounds(weekId);
  if (!bounds) return null;

  const events = await getWeeklyFocusCheckinEvents(userId, weekId);
  const eventsForAgg: WeeklyFocusCheckinEvent[] = events.map((e) => ({
    subject_code: e.subject_code,
    numeric_value: e.numeric_value,
    occurred_at: e.occurred_at,
    item_id: (e.metadata?.item_id as string) ?? e.subject_code,
  }));
  const escalationBoundary = await getWeeklyEscalationAndBoundarySignals(userId, weekId);
  const agg = aggregateWeeklyFocusCheckins(eventsForAgg, escalationBoundary);

  const input = await buildFocusInputForUser(userId, undefined);
  const suggestedNextWeek = suggestWeeklyFocusItems(input);

  const todayUtc = new Date().toISOString().slice(0, 10);
  const submittedToday = events.some((e) => e.occurred_at.startsWith(todayUtc));

  return {
    weekId,
    ...agg,
    checkinCount: events.length,
    submittedToday,
    suggestedNextWeek,
  };
}
