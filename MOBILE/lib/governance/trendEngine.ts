/**
 * Longitudinal Drift Memory — trend engine.
 * Deterministic discipline/recovery/focus trends from 30d counts and optional rolling window.
 * No AI. No free text. Pure counts and fixed reason codes.
 */

export type DriftTrend = "improving" | "stable" | "declining" | "cyclical";

export type LongitudinalSignals = {
  disciplineTrend: DriftTrend;
  recoveryTrend: DriftTrend;
  focusTrend: DriftTrend;
  cycleDetected: boolean;
  reasons: string[];
};

/** Allowlisted reason codes. */
export const LONGITUDINAL_REASON_CODES = [
  "VIOLATION_TREND_UP",
  "COMPLETION_TREND_UP",
  "FOCUS_DROP_30D",
  "CYCLICAL_PATTERN",
] as const;

export type LongitudinalReasonCode = (typeof LONGITUDINAL_REASON_CODES)[number];

export type ComputeLongitudinalInput = {
  violationCounts30d: {
    commitmentViolations30d: number;
    abstinenceViolations30d: number;
  };
  completionCounts30d: {
    commitmentCompleted30d: number;
  };
  focusSessions30d: number;
  /** Optional: e.g. weekly violation counts [oldest ... newest]. Used for trend/cycle. */
  priorTrendSnapshot?: number[];
};

/**
 * Detect if array has alternating high-low pattern (at least 2 spikes in distinct "weeks").
 * Spike = value above mean. Cycle = 2+ spikes with low in between.
 */
function detectCyclical(series: number[]): boolean {
  if (series.length < 4) return false;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const isSpike = (v: number) => v > mean && mean >= 0;
  const spikes = series.map((v, i) => (isSpike(v) ? i : -1)).filter((i) => i >= 0);
  if (spikes.length < 2) return false;
  const gaps = spikes.slice(1).map((s, i) => s - spikes[i]);
  const hasGap = gaps.some((g) => g > 1);
  return hasGap;
}

/**
 * Check if series is roughly alternating (high-low-high-low).
 */
function isAlternating(series: number[]): boolean {
  if (series.length < 4) return false;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const above = series.map((v) => v > mean);
  let alternations = 0;
  for (let i = 1; i < above.length; i++) {
    if (above[i] !== above[i - 1]) alternations++;
  }
  return alternations >= 2;
}

export function computeLongitudinalSignals(input: ComputeLongitudinalInput): LongitudinalSignals {
  const {
    violationCounts30d,
    completionCounts30d,
    focusSessions30d,
    priorTrendSnapshot = [],
  } = input;

  const commitmentViolations30d = violationCounts30d.commitmentViolations30d;
  const abstinenceViolations30d = violationCounts30d.abstinenceViolations30d;
  const commitmentCompleted30d = completionCounts30d.commitmentCompleted30d;
  const reasons: string[] = [];

  // —— Discipline trend (commitment violations + completions) ——
  let disciplineTrend: DriftTrend = "stable";
  const violationsLow = commitmentViolations30d <= 1 && abstinenceViolations30d === 0;
  const completionsHigh = commitmentCompleted30d >= 3;

  if (priorTrendSnapshot.length >= 4 && isAlternating(priorTrendSnapshot)) {
    disciplineTrend = "cyclical";
    reasons.push("CYCLICAL_PATTERN");
  } else if (priorTrendSnapshot.length >= 2) {
    const first = priorTrendSnapshot[0];
    const last = priorTrendSnapshot[priorTrendSnapshot.length - 1];
    if (last > first) {
      disciplineTrend = "declining";
      reasons.push("VIOLATION_TREND_UP");
    } else if (completionsHigh && violationsLow) {
      disciplineTrend = "improving";
      reasons.push("COMPLETION_TREND_UP");
    }
  } else if (completionsHigh && violationsLow) {
    disciplineTrend = "improving";
    reasons.push("COMPLETION_TREND_UP");
  } else if (commitmentViolations30d >= 2 || abstinenceViolations30d >= 1) {
    disciplineTrend = "declining";
    if (!reasons.includes("VIOLATION_TREND_UP")) reasons.push("VIOLATION_TREND_UP");
  }

  // —— Recovery trend (abstinence) ——
  let recoveryTrend: DriftTrend = "stable";
  if (abstinenceViolations30d >= 1) recoveryTrend = "declining";
  else if (completionsHigh && abstinenceViolations30d === 0) recoveryTrend = "improving";

  // —— Focus trend ——
  let focusTrend: DriftTrend = "stable";
  if (focusSessions30d === 0 && priorTrendSnapshot.length > 0) {
    focusTrend = "declining";
    reasons.push("FOCUS_DROP_30D");
  } else if (focusSessions30d >= 4) {
    focusTrend = "improving";
  }

  // —— Cycle detection: violation spikes in 2+ distinct periods ——
  const cycleDetected =
    priorTrendSnapshot.length >= 4 && (detectCyclical(priorTrendSnapshot) || isAlternating(priorTrendSnapshot));
  if (cycleDetected && !reasons.includes("CYCLICAL_PATTERN")) reasons.push("CYCLICAL_PATTERN");

  return {
    disciplineTrend,
    recoveryTrend,
    focusTrend,
    cycleDetected,
    reasons: Array.from(new Set(reasons)),
  };
}
