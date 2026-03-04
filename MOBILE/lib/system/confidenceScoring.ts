/**
 * Shared Confidence Scoring + Outlier Damping primitives.
 * Used by all domain engines to compute confidence_score, freshness, staleness.
 * Deterministic. No AI. No narrative.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConfidenceInput {
  sampleSize: number;
  freshnessHours: number;
  minSampleSize: number;
  idealSampleSize: number;
  maxFreshnessHours: number;
}

export interface ConfidenceOutput {
  confidence_score: number;
  sample_size: number;
  data_freshness_hours: number;
  is_stale: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const HEALTH_CONFIDENCE = {
  minSampleSize: 3,
  idealSampleSize: 7,
  maxFreshnessHours: 168,
  staleThresholdHours: 72,
} as const;

export const FINANCIAL_CONFIDENCE = {
  minSampleSize: 5,
  idealSampleSize: 20,
  maxFreshnessHours: 168,
  staleThresholdHours: 168,
} as const;

export const COGNITIVE_CONFIDENCE = {
  minSampleSize: 3,
  idealSampleSize: 10,
  maxFreshnessHours: 336,
  staleThresholdHours: 168,
} as const;

// ─── Confidence Scoring ──────────────────────────────────────────────────────

/**
 * Deterministic confidence score (0–100).
 * Returns 0 if sample_size < minimum OR freshness > max.
 * Scales linearly with sample coverage, decays with age.
 */
export function computeConfidenceScore(input: ConfidenceInput): number {
  const { sampleSize, freshnessHours, minSampleSize, idealSampleSize, maxFreshnessHours } = input;

  if (sampleSize < minSampleSize) return 0;
  if (freshnessHours > maxFreshnessHours) return 0;

  const sampleCoverage = Math.min(1, sampleSize / idealSampleSize);
  const sampleScore = sampleCoverage * 60;

  const freshnessDecay = Math.max(0, 1 - (freshnessHours / maxFreshnessHours));
  const freshnessScore = freshnessDecay * 40;

  return Math.round(Math.min(100, Math.max(0, sampleScore + freshnessScore)));
}

/**
 * Compute staleness from the most recent entry timestamp.
 * Returns hours since last entry and staleness flag.
 */
export function computeFreshness(
  latestRecordedAt: string | null,
  staleThresholdHours: number,
  now?: Date,
): { freshnessHours: number; isStale: boolean } {
  if (!latestRecordedAt) {
    return { freshnessHours: 999, isStale: true };
  }

  const latest = new Date(latestRecordedAt).getTime();
  const current = (now ?? new Date()).getTime();
  const hoursAgo = Math.floor((current - latest) / (1000 * 60 * 60));

  return {
    freshnessHours: Math.max(0, hoursAgo),
    isStale: hoursAgo > staleThresholdHours,
  };
}

/**
 * Full confidence output for a domain engine.
 */
export function computeFullConfidence(
  sampleSize: number,
  latestRecordedAt: string | null,
  config: {
    minSampleSize: number;
    idealSampleSize: number;
    maxFreshnessHours: number;
    staleThresholdHours: number;
  },
  now?: Date,
): ConfidenceOutput {
  const { freshnessHours, isStale } = computeFreshness(
    latestRecordedAt,
    config.staleThresholdHours,
    now,
  );

  const confidence_score = computeConfidenceScore({
    sampleSize,
    freshnessHours,
    minSampleSize: config.minSampleSize,
    idealSampleSize: config.idealSampleSize,
    maxFreshnessHours: config.maxFreshnessHours,
  });

  return {
    confidence_score,
    sample_size: sampleSize,
    data_freshness_hours: freshnessHours,
    is_stale: isStale,
  };
}

// ─── Outlier Detection ───────────────────────────────────────────────────────

export interface OutlierRule {
  field: string;
  softCap: number;
  dampingFactor: number;
}

export const HEALTH_OUTLIER_RULES: OutlierRule[] = [
  { field: "sleep_hours", softCap: 14, dampingFactor: 0.5 },
  { field: "exercise_minutes", softCap: 240, dampingFactor: 0.5 },
];

export const FINANCIAL_OUTLIER_RULES: OutlierRule[] = [
  { field: "impulse_spike", softCap: 10, dampingFactor: 0.5 },
];

export const COGNITIVE_OUTLIER_RULES: OutlierRule[] = [
  { field: "volatility_spike", softCap: 80, dampingFactor: 0.6 },
];

/**
 * Detect whether a health metric row contains suspicious values.
 * Does NOT block — only flags.
 */
export function isHealthMetricSuspicious(row: {
  sleep_hours: number;
  exercise_minutes: number;
}): boolean {
  return row.sleep_hours > 14 || row.exercise_minutes > 240;
}

/**
 * Detect whether a financial entry looks suspicious (based on context).
 * Spike detection: true if impulse count in a single day exceeds threshold.
 */
export function isFinancialEntrySuspicious(
  dailyImpulseCount: number,
): boolean {
  return dailyImpulseCount > 10;
}

/**
 * Detect whether a decision row looks suspicious.
 */
export function isDecisionSuspicious(row: {
  confidence_score: number;
  emotional_intensity: number;
}): boolean {
  return row.confidence_score === 10 && row.emotional_intensity === 10;
}

/**
 * Damp an extreme value toward the soft cap.
 * Returns the damped value if above softCap, otherwise returns original.
 */
export function dampValue(value: number, softCap: number, dampingFactor: number): number {
  if (value <= softCap) return value;
  const excess = value - softCap;
  return softCap + excess * dampingFactor;
}

/**
 * Apply damping to health metric values for scoring purposes.
 * Returns a copy with damped values (does not mutate input).
 */
export function dampHealthMetric(row: {
  sleep_hours: number;
  exercise_minutes: number;
}): { sleep_hours: number; exercise_minutes: number } {
  return {
    sleep_hours: dampValue(row.sleep_hours, 14, 0.5),
    exercise_minutes: dampValue(row.exercise_minutes, 240, 0.5),
  };
}
