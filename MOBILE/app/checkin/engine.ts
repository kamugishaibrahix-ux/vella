/**
 * Check-in Engine - Pure business logic for weekly contract system
 * No UI logic here. Pure functions only.
 */

import type { WeeklyContract, ContractOrigin, Rating, DailyCheckin, WeeklyState } from "./types";
import { MAX_TOTAL_CONTRACTS, getUserAllowed, validateAddContract } from "./limits";

/**
 * Migrate legacy contract origin at read boundary.
 * Maps "vella" -> "system"; passes through valid origins unchanged.
 */
export function migrateContractOrigin(raw: string): ContractOrigin {
  if (raw === "vella") return "system";
  if (raw === "system" || raw === "user") return raw;
  return "user";
}

/**
 * Generate ISO week key from date: "2026-W08"
 */
export function getWeekKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor(
    (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
  );
  const weekNumber = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, "0")}`;
}

/**
 * Get today's date as ISO string: "2026-02-25"
 */
export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rating weights for score calculation:
 * Strong = 1.0, Neutral = 0.6, Struggling = 0.2
 */
const RATING_WEIGHTS: Record<Rating, number> = {
  strong: 1.0,
  neutral: 0.6,
  struggling: 0.2,
};

/**
 * Calculate daily score from ratings
 * Average of all contract ratings for the day
 */
export function calculateDailyScore(
  ratings: Record<string, Rating>
): number {
  const ratingsList = Object.values(ratings);
  if (ratingsList.length === 0) return 0;

  const sum = ratingsList.reduce((acc, rating) => acc + RATING_WEIGHTS[rating], 0);
  return sum / ratingsList.length;
}

/**
 * Calculate weekly average across all checkins
 */
export function calculateWeeklyAverage(checkins: DailyCheckin[]): number {
  if (checkins.length === 0) return 0;

  const sum = checkins.reduce((acc, checkin) => {
    return acc + calculateDailyScore(checkin.ratings);
  }, 0);

  return sum / checkins.length;
}

/**
 * Count contracts by origin
 */
export function countContracts(contracts: WeeklyContract[]): {
  vellaCount: number;
  userCount: number;
  totalCount: number;
} {
  const systemCount = contracts.filter((c) => c.origin === "system").length;
  const userCount = contracts.filter((c) => c.origin === "user").length;
  return { vellaCount: systemCount, userCount, totalCount: systemCount + userCount };
}

/**
 * Add contract with limit validation
 * Returns new state or error message
 */
export function addContract(
  state: WeeklyState,
  contract: Omit<WeeklyContract, "id" | "createdAt" | "weekKey">
): { success: true; state: WeeklyState } | { success: false; error: string } {
  const { vellaCount, userCount } = countContracts(state.contracts);

  const error = validateAddContract(contract.origin, vellaCount, userCount);
  if (error) {
    return { success: false, error };
  }

  const newContract: WeeklyContract = {
    ...contract,
    id: `contract-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    weekKey: state.weekKey,
  };

  return {
    success: true,
    state: {
      ...state,
      contracts: [...state.contracts, newContract],
    },
  };
}

/**
 * Delete contract by ID
 * Both Vella and User contracts are deletable
 */
export function deleteContract(
  state: WeeklyState,
  contractId: string
): { success: true; state: WeeklyState } | { success: false; error: string } {
  const contract = state.contracts.find((c) => c.id === contractId);

  if (!contract) {
    return { success: false, error: "Contract not found" };
  }

  return {
    success: true,
    state: {
      ...state,
      contracts: state.contracts.filter((c) => c.id !== contractId),
    },
  };
}

/**
 * Add daily checkin
 */
export function addCheckin(
  state: WeeklyState,
  ratings: Record<string, Rating>
): { success: true; state: WeeklyState } | { success: false; error: string } {
  const today = getTodayKey();

  // Check if already checked in today
  const existingIndex = state.checkins.findIndex((c) => c.date === today);

  const newCheckin: DailyCheckin = {
    date: today,
    ratings,
  };

  const newCheckins =
    existingIndex >= 0
      ? [
          ...state.checkins.slice(0, existingIndex),
          newCheckin,
          ...state.checkins.slice(existingIndex + 1),
        ]
      : [...state.checkins, newCheckin];

  return {
    success: true,
    state: {
      ...state,
      checkins: newCheckins,
    },
  };
}

/**
 * Check if user has checked in today
 */
export function hasCheckedInToday(state: WeeklyState): boolean {
  const today = getTodayKey();
  return state.checkins.some((c) => c.date === today);
}

/**
 * Get checkin for specific date
 */
export function getCheckinForDate(
  state: WeeklyState,
  date: string
): DailyCheckin | undefined {
  return state.checkins.find((c) => c.date === date);
}

/**
 * Get days locked in this week (count of checkins)
 */
export function getLockedDaysCount(state: WeeklyState): number {
  return state.checkins.length;
}

/**
 * Create empty weekly state
 */
export function createEmptyState(weekKey?: string): WeeklyState {
  return {
    weekKey: weekKey || getWeekKey(),
    contracts: [],
    checkins: [],
  };
}
