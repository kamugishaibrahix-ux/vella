/**
 * Types for Weekly Focus Check-In (matches API contracts).
 */

export type FocusSourceType = "commitment" | "value" | "focus" | "governance";

export type FocusRating = "strong" | "neutral" | "struggling";

export interface WeeklyFocusItem {
  itemId: string;
  sourceType: FocusSourceType;
  subjectCode: string;
  label: string;
  priority: number;
  reasons?: string[];
}

export interface FocusWeekResponse {
  weekId: string;
  items: WeeklyFocusItem[];
  weekSoFarPercent?: number;
  checkinCount?: number;
  submittedToday?: boolean;
}

export interface RatingPayload {
  itemId: string;
  subjectCode: string;
  sourceType: FocusSourceType;
  rating: FocusRating;
}

export interface WeeklyFocusReview {
  weekId: string;
  completionScore0to100: number;
  checkinCount?: number;
  strongestSubjectCode: string | null;
  weakestSubjectCode: string | null;
  consistencyTier: "steady" | "mixed" | "fragile";
  earnedValidationEligible: boolean;
  earnedValidationReasons: string[];
  suggestedNextWeek: WeeklyFocusItem[];
}
