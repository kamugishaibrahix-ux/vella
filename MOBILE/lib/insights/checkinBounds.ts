/**
 * Phase 3.2: Deterministic bounds for check-in data used in insights.
 * Prevents OOM from malicious clients sending unlimited check-ins.
 * All bounds are server-enforced and non-overridable by client.
 */

import type { DailyCheckIn } from "@/lib/memory/types";

// ============================================================================
// HARD LIMITS - These are non-negotiable and server-enforced
// ============================================================================

/** Maximum lookback window in days for insights analysis */
export const CHECKIN_LOOKBACK_DAYS = 90;

/** Maximum number of check-in rows to process for insights */
export const CHECKIN_MAX_ROWS = 200;

/** Maximum check-ins to send to LLM prompts (aggressive limit for token efficiency) */
export const CHECKIN_PROMPT_LIMIT = 20;

// ============================================================================
// BOUNDING FUNCTIONS
// ============================================================================

/**
 * Apply deterministic bounds to check-ins for insights processing.
 * Order of operations:
 * 1. Sort by date (newest first)
 * 2. Apply lookback window filter
 * 3. Apply row limit cap
 *
 * This function is pure and deterministic - same input always produces same output.
 */
export function applyCheckinBounds(
  checkins: DailyCheckIn[],
  options?: {
    lookbackDays?: number;
    maxRows?: number;
  }
): DailyCheckIn[] {
  const lookbackDays = options?.lookbackDays ?? CHECKIN_LOOKBACK_DAYS;
  const maxRows = options?.maxRows ?? CHECKIN_MAX_ROWS;

  // Step 1: Deterministic sort by date (newest first)
  const sorted = [...checkins].sort((a, b) => {
    const dateA = a.date ?? a.createdAt ?? "";
    const dateB = b.date ?? b.createdAt ?? "";
    return dateB.localeCompare(dateA);
  });

  // Step 2: Apply lookback window (if check-in has date)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  const cutoffIso = cutoffDate.toISOString().split("T")[0];

  const withinWindow = sorted.filter((c) => {
    const entryDate = c.date ?? c.createdAt;
    if (!entryDate) return true; // Include if no date (conservative)
    // Handle both ISO and date-only formats
    const datePart = entryDate.slice(0, 10);
    return datePart >= cutoffIso;
  });

  // Step 3: Hard row limit
  return withinWindow.slice(0, maxRows);
}

/**
 * Condense check-ins for LLM prompt usage.
 * This reduces token usage while preserving signal.
 * Uses deterministic aggregation - never uses LLM for summarization.
 */
export function condenseCheckinsForPrompt(
  checkins: DailyCheckIn[],
  limit: number = CHECKIN_PROMPT_LIMIT
): Array<{
  date: string;
  mood: number;
  stress: number;
  energy: number;
  focus?: number | null;
  note?: string | null;
}> {
  // Already bounded by applyCheckinBounds, but double-check
  const bounded = checkins.slice(0, CHECKIN_MAX_ROWS);

  // Take the most recent N for the prompt
  return bounded.slice(0, limit).map((entry) => ({
    date: entry.date ?? entry.createdAt ?? "",
    mood: entry.mood ?? 0,
    stress: entry.stress ?? 0,
    energy: entry.energy ?? 0,
    focus: entry.focus ?? null,
    note: entry.note ?? null,
  }));
}

/**
 * Deterministic summarization of check-ins for feature extraction.
 * No LLM involvement - pure statistical aggregation.
 */
export function summarizeCheckinsDeterministic(checkins: DailyCheckIn[]): {
  total: number;
  avgMood: number;
  avgStress: number;
  avgEnergy: number;
  trendDirection: "improving" | "declining" | "stable";
  streakDays: number;
  volatilityScore: number;
} {
  const bounded = checkins.slice(0, CHECKIN_MAX_ROWS);
  const total = bounded.length;

  if (total === 0) {
    return {
      total: 0,
      avgMood: 0,
      avgStress: 0,
      avgEnergy: 0,
      trendDirection: "stable",
      streakDays: 0,
      volatilityScore: 0,
    };
  }

  // Calculate averages
  const avgMood =
    bounded.reduce((sum, c) => sum + (c.mood ?? 5), 0) / total;
  const avgStress =
    bounded.reduce((sum, c) => sum + (c.stress ?? 5), 0) / total;
  const avgEnergy =
    bounded.reduce((sum, c) => sum + (c.energy ?? 5), 0) / total;

  // Calculate trend (comparing first half to second half)
  const half = Math.floor(total / 2);
  const firstHalf = bounded.slice(0, half);
  const secondHalf = bounded.slice(half);

  const firstMood =
    firstHalf.reduce((sum, c) => sum + (c.mood ?? 5), 0) /
    (firstHalf.length || 1);
  const secondMood =
    secondHalf.reduce((sum, c) => sum + (c.mood ?? 5), 0) /
    (secondHalf.length || 1);

  const trendDirection: "improving" | "declining" | "stable" =
    secondMood > firstMood + 0.5
      ? "improving"
      : secondMood < firstMood - 0.5
        ? "declining"
        : "stable";

  // Simple streak calculation (consecutive days with data)
  let streakDays = 0;
  const sorted = [...bounded].sort((a, b) => {
    const dateA = a.date ?? a.createdAt ?? "";
    const dateB = b.date ?? b.createdAt ?? "";
    return dateB.localeCompare(dateA); // Newest first
  });

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = new Date(sorted[i]?.date ?? sorted[i]?.createdAt ?? 0);
    const next = new Date(sorted[i + 1]?.date ?? sorted[i + 1]?.createdAt ?? 0);
    const diffMs = curr.getTime() - next.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays <= 1.5) {
      streakDays++;
    } else {
      break;
    }
  }

  // Volatility: standard deviation of mood
  const variance =
    bounded.reduce((sum, c) => {
      const diff = (c.mood ?? 5) - avgMood;
      return sum + diff * diff;
    }, 0) / total;
  const volatilityScore = Math.sqrt(variance);

  return {
    total,
    avgMood: Math.round(avgMood * 10) / 10,
    avgStress: Math.round(avgStress * 10) / 10,
    avgEnergy: Math.round(avgEnergy * 10) / 10,
    trendDirection,
    streakDays,
    volatilityScore: Math.round(volatilityScore * 10) / 10,
  };
}

/**
 * Validate that check-ins array is within acceptable bounds.
 * Returns validation result without modifying data.
 */
export function validateCheckinBounds(
  checkins: DailyCheckIn[],
  options?: {
    maxRows?: number;
    lookbackDays?: number;
  }
): {
  valid: boolean;
  originalCount: number;
  wouldBeTruncated: boolean;
  violations: string[];
} {
  const maxRows = options?.maxRows ?? CHECKIN_MAX_ROWS;
  const lookbackDays = options?.lookbackDays ?? CHECKIN_LOOKBACK_DAYS;
  const violations: string[] = [];

  const originalCount = checkins.length;
  const wouldBeTruncated = originalCount > maxRows;

  if (originalCount > maxRows) {
    violations.push(`checkins_exceeds_max: ${originalCount} > ${maxRows}`);
  }

  // Check for stale data (older than lookback)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  const staleCount = checkins.filter((c) => {
    const entryDate = c.date ?? c.createdAt;
    if (!entryDate) return false;
    return entryDate.slice(0, 10) < cutoffDate.toISOString().split("T")[0];
  }).length;

  if (staleCount > 0) {
    violations.push(`stale_checkins: ${staleCount} older than ${lookbackDays} days`);
  }

  return {
    valid: violations.length === 0,
    originalCount,
    wouldBeTruncated,
    violations,
  };
}
