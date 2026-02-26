/**
 * Contract Limits - Strict enforcement for weekly contracts
 * Pure functions only - no UI logic
 */

export const MAX_VELLA_CONTRACTS = 5;
export const MAX_USER_CONTRACTS = 5;
export const MAX_TOTAL_CONTRACTS = 6;

/**
 * Calculate how many user contracts are allowed given Vella contract count
 * Formula: userAllowed = min(5, 6 - vellaCount)
 */
export function getUserAllowed(vellaCount: number): number {
  return Math.min(
    MAX_USER_CONTRACTS,
    MAX_TOTAL_CONTRACTS - vellaCount
  );
}

/**
 * Check if user can add a new user contract
 */
export function canAddUserContract(vellaCount: number, userCount: number): boolean {
  const userAllowed = getUserAllowed(vellaCount);
  return userCount < userAllowed;
}

/**
 * Get human-readable limit message
 */
export function getLimitMessage(vellaCount: number, userCount: number): string | null {
  const totalCount = vellaCount + userCount;
  if (totalCount >= MAX_TOTAL_CONTRACTS) {
    return "Maximum contracts reached (6/6)";
  }
  const userAllowed = getUserAllowed(vellaCount);
  if (userCount >= userAllowed) {
    return `Limit reached this week (${userCount}/${userAllowed} user contracts)`;
  }
  return null;
}

/**
 * Validate contract addition - returns null if valid, error string if invalid
 */
export function validateAddContract(
  origin: "vella" | "user",
  vellaCount: number,
  userCount: number
): string | null {
  const totalCount = vellaCount + userCount;

  if (totalCount >= MAX_TOTAL_CONTRACTS) {
    return `Maximum ${MAX_TOTAL_CONTRACTS} contracts allowed`;
  }

  if (origin === "vella" && vellaCount >= MAX_VELLA_CONTRACTS) {
    return `Maximum ${MAX_VELLA_CONTRACTS} Vella contracts allowed`;
  }

  if (origin === "user") {
    const userAllowed = getUserAllowed(vellaCount);
    if (userCount >= userAllowed) {
      return `Maximum ${userAllowed} user contracts allowed this week`;
    }
  }

  return null;
}
