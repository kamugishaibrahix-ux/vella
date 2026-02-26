/**
 * Exercise Logic - Deterministic recommendation engine
 * Maps morning state to exercise recommendations
 * No AI, pure deterministic logic
 */

import type {
  Exercise,
  ExerciseCategory,
  ExerciseLogEntry,
} from "./exerciseLibrary";
import { EXERCISE_LIBRARY, getExercisesByCategory, getTodayExerciseLogs } from "./exerciseLibrary";

// ---------------------------------------------------------------------------
// Morning Landing State
// ---------------------------------------------------------------------------

export type MorningLanding = "lighter" | "same" | "heavier";

const LANDING_STORAGE_KEY = "vella-morning-landing";

export function setMorningLanding(landing: MorningLanding): void {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(LANDING_STORAGE_KEY, JSON.stringify({ landing, date: today }));
}

export function getMorningLanding(): MorningLanding | null {
  try {
    const raw = localStorage.getItem(LANDING_STORAGE_KEY);
    if (!raw) return null;
    const { landing, date } = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (date !== today) return null;
    return landing as MorningLanding;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deterministic Recommendation Rules
// ---------------------------------------------------------------------------

/**
 * Map landing state to primary recommended category
 * Pure function: same input always produces same output
 */
export function getRecommendedCategory(landing: MorningLanding): ExerciseCategory {
  switch (landing) {
    case "heavier":
      return "stabilise"; // Need grounding when feeling heavy
    case "lighter":
      return "focus"; // Ready to concentrate when feeling light
    case "same":
      return "energy"; // Maintain momentum at baseline
    default:
      return "energy";
  }
}

/**
 * Get secondary recommendation (for variety)
 */
export function getSecondaryCategory(landing: MorningLanding): ExerciseCategory {
  switch (landing) {
    case "heavier":
      return "recovery"; // Recovery as secondary when heavy
    case "lighter":
      return "energy"; // Energy boost after focus
    case "same":
      return "focus"; // Add focus work to baseline
    default:
      return "focus";
  }
}

// ---------------------------------------------------------------------------
// Recommendation Engine
// ---------------------------------------------------------------------------

export interface ExerciseRecommendation {
  exercise: Exercise;
  reason: string;
  priority: number; // 1 = highest
}

/**
 * Generate top 3 recommended exercises based on:
 * 1. Morning landing state
 * 2. Active contract type (if exists)
 * 3. Today's completed exercises (don't repeat)
 * 
 * No AI. Pure deterministic logic.
 */
export function generateRecommendations(
  landing: MorningLanding,
  hasActiveTimeBlock: boolean,
  completedToday: string[] // exercise IDs already done
): ExerciseRecommendation[] {
  const recommendations: ExerciseRecommendation[] = [];
  const primaryCategory = getRecommendedCategory(landing);
  const secondaryCategory = getSecondaryCategory(landing);

  // Primary category exercises
  const primaryExercises = getExercisesByCategory(primaryCategory).filter(
    (e) => !completedToday.includes(e.id)
  );

  // Add top 2 from primary category
  for (let i = 0; i < Math.min(2, primaryExercises.length); i++) {
    const exercise = primaryExercises[i];
    let reason = `Recommended for ${landing} mornings`;
    
    if (hasActiveTimeBlock && exercise.category === "focus") {
      reason = "Supports your active focus block";
    }
    
    recommendations.push({
      exercise,
      reason,
      priority: i + 1,
    });
  }

  // Add 1 from secondary category if available
  const secondaryExercises = getExercisesByCategory(secondaryCategory).filter(
    (e) => !completedToday.includes(e.id) &&
    !recommendations.some((r) => r.exercise.id === e.id)
  );

  if (secondaryExercises.length > 0) {
    recommendations.push({
      exercise: secondaryExercises[0],
      reason: `Secondary recommendation for ${landing} state`,
      priority: 3,
    });
  }

  // If we don't have 3, fill with any remaining exercises
  if (recommendations.length < 3) {
    const usedIds = new Set(recommendations.map((r) => r.exercise.id));
    const usedIdsArray = Array.from(usedIds);
    const remaining = EXERCISE_LIBRARY.filter(
      (e) => !usedIdsArray.includes(e.id) && !completedToday.includes(e.id)
    );
    
    for (let i = 0; i < remaining.length && recommendations.length < 3; i++) {
      recommendations.push({
        exercise: remaining[i],
        reason: "Additional option for today",
        priority: recommendations.length + 1,
      });
    }
  }

  return recommendations.slice(0, 3);
}

/**
 * Get current recommendations (convenience function)
 * Uses localStorage for landing state and exercise logs
 */
export async function getCurrentRecommendations(
  hasActiveTimeBlock: boolean = false
): Promise<ExerciseRecommendation[]> {
  const landing = getMorningLanding() || "same";
  const todayLogs = getTodayExerciseLogs();
  const completedIds = todayLogs.map((log) => log.exerciseId);
  
  return generateRecommendations(landing, hasActiveTimeBlock, completedIds);
}

// ---------------------------------------------------------------------------
// Quick Select Helpers
// ---------------------------------------------------------------------------

export function getQuickExercises(): Exercise[] {
  // Return 5 short exercises for quick selection
  return EXERCISE_LIBRARY.filter((e) => e.durationSeconds <= 300).slice(0, 5);
}

export function getCategoryLabel(category: ExerciseCategory): string {
  const labels: Record<ExerciseCategory, string> = {
    stabilise: "Stabilise",
    focus: "Focus",
    energy: "Energy",
    recovery: "Recovery",
  };
  return labels[category];
}

export function getCategoryDescription(category: ExerciseCategory): string {
  const descriptions: Record<ExerciseCategory, string> = {
    stabilise: "Grounding exercises for when you're feeling scattered or heavy",
    focus: "Concentration practices for deep work and clarity",
    energy: "Movement and activation for momentum maintenance",
    recovery: "Restoration and wind-down for preparing to recharge",
  };
  return descriptions[category];
}

// ---------------------------------------------------------------------------
// Statistics (Local Only)
// ---------------------------------------------------------------------------

export interface ExerciseStats {
  totalCompleted: number;
  totalMinutes: number;
  byCategory: Record<ExerciseCategory, number>;
  currentStreak: number;
}

export function getExerciseStats(): ExerciseStats {
  const key = "vella-exercise-log";
  const all: ExerciseLogEntry[] = JSON.parse(localStorage.getItem(key) || "[]");
  
  const stats: ExerciseStats = {
    totalCompleted: all.length,
    totalMinutes: Math.round(all.reduce((sum, e) => sum + e.durationSeconds, 0) / 60),
    byCategory: {
      stabilise: 0,
      focus: 0,
      energy: 0,
      recovery: 0,
    },
    currentStreak: calculateStreak(all),
  };

  // Count by category
  for (const log of all) {
    const exercise = EXERCISE_LIBRARY.find((e) => e.id === log.exerciseId);
    if (exercise) {
      stats.byCategory[exercise.category]++;
    }
  }

  return stats;
}

function calculateStreak(logs: ExerciseLogEntry[]): number {
  if (logs.length === 0) return 0;
  
  const uniqueDates = new Set(logs.map((l) => l.dateKey));
  const dates = Array.from(uniqueDates).sort().reverse();
  if (dates.length === 0) return 0;
  
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  
  // Check if exercised today or yesterday
  if (!dates.includes(today) && !dates.includes(yesterday)) {
    return 0;
  }
  
  // Count consecutive days
  let streak = 0;
  let checkDate = dates.includes(today) ? today : yesterday;
  
  for (const date of dates) {
    if (date === checkDate) {
      streak++;
      // Move to previous day
      checkDate = new Date(new Date(checkDate).getTime() - 86400000)
        .toISOString()
        .slice(0, 10);
    } else {
      break;
    }
  }
  
  return streak;
}
