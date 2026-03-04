/**
 * Check-in Types - Core data structures for weekly contract system
 * Pure types only - no UI logic
 */

export type ContractOrigin = "user" | "system";

export interface WeeklyContract {
  id: string;
  title: string;
  focusArea: string;
  origin: ContractOrigin;
  createdAt: string;
  weekKey: string;
}

export type Rating = "strong" | "neutral" | "struggling";

export interface DailyCheckin {
  date: string;
  ratings: Record<string, Rating>;
}

export interface WeeklyState {
  weekKey: string;
  contracts: WeeklyContract[];
  checkins: DailyCheckin[];
}

// Legacy type for ReviewPanel compatibility
export interface WeeklyFocusReview {
  strongestSubjectCode: string;
  weakestSubjectCode: string;
  completionScore0to100: number;
  consistencyTier: "steady" | "mixed" | "fragile";
  earnedValidationEligible: boolean;
  suggestedNextWeek: { itemId: string; label: string }[];
}

// Legacy type for WeeklyFocusCard compatibility
export interface WeeklyFocusItem {
  id: string;
  label: string;
  subjectCode: string;
}

// Legacy type for devMock compatibility
export interface FocusWeekResponse {
  weekId: string;
  items: {
    itemId: string;
    sourceType: string;
    subjectCode: string;
    label: string;
    priority: number;
    reasons: string[];
  }[];
}

export interface AppState extends WeeklyState {
  todayRatings: Record<string, Rating>;
  isLocked: boolean;
  completedDays: number;
}
