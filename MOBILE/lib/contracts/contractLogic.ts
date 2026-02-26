/**
 * Contract Logic - Deterministic business rules for contract execution
 * No AI, no probabilistic logic. Pure deterministic state transitions.
 */

import type { Contract, ContractStatus, ContractType } from "./contractStore";

// ---------------------------------------------------------------------------
// Pure Functions - Deterministic State Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate current contract status based on time and existing state
 * Deterministic: same inputs always produce same output
 */
export function calculateContractStatus(
  contract: Contract,
  currentTimeMs: number
): ContractStatus {
  // Terminal states are sticky
  if (contract.status === "completed" || contract.status === "violated") {
    return contract.status;
  }

  // Time-based calculation
  if (currentTimeMs < contract.startTime) {
    return "pending";
  }

  if (currentTimeMs >= contract.startTime && currentTimeMs <= contract.endTime) {
    return "active";
  }

  // Past end time
  if (contract.status === "active" || contract.status === "pending") {
    return "expired";
  }

  return contract.status;
}

/**
 * Get time remaining for active contract
 * Returns 0 if not active
 */
export function getTimeRemaining(contract: Contract, currentTimeMs: number): number {
  const status = calculateContractStatus(contract, currentTimeMs);
  if (status !== "active") return 0;
  return Math.max(0, contract.endTime - currentTimeMs);
}

/**
 * Get elapsed time for active contract
 * Returns 0 if not yet started
 */
export function getElapsedTime(contract: Contract, currentTimeMs: number): number {
  if (currentTimeMs < contract.startTime) return 0;
  return Math.min(
    contract.endTime - contract.startTime,
    currentTimeMs - contract.startTime
  );
}

/**
 * Calculate progress percentage (0-100)
 */
export function calculateProgress(contract: Contract, currentTimeMs: number): number {
  const total = contract.endTime - contract.startTime;
  if (total <= 0) return 0;

  const elapsed = getElapsedTime(contract, currentTimeMs);
  return Math.min(100, Math.round((elapsed / total) * 100));
}

/**
 * Format milliseconds to MM:SS
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format milliseconds to human readable (e.g., "25 min remaining")
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "Time's up";

  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) {
    return `${minutes} min${minutes !== 1 ? "s" : ""} remaining`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""} remaining`;
  }
  return `${hours}h ${remainingMins}m remaining`;
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

export function createContract(
  title: string,
  type: ContractType,
  startTime: number,
  endTime: number,
  recurrence: "none" | "daily" = "none"
): Contract {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    title,
    type,
    startTime,
    endTime,
    status: startTime > now ? "pending" : "active",
    recurrence,
    createdAt: now,
  };
}

export function createQuickContract(
  title: string,
  durationMinutes: number,
  type: ContractType = "time_block"
): Contract {
  const now = Date.now();
  const startTime = now;
  const endTime = now + durationMinutes * 60 * 1000;

  return createContract(title, type, startTime, endTime, "none");
}

// ---------------------------------------------------------------------------
// State Transition Guards
// ---------------------------------------------------------------------------

export type TransitionResult =
  | { success: true; newStatus: ContractStatus }
  | { success: false; reason: string };

/**
 * Validate state transition
 * All transitions must be explicit and deterministic
 */
export function validateTransition(
  contract: Contract,
  newStatus: ContractStatus,
  currentTimeMs: number
): TransitionResult {
  const currentStatus = calculateContractStatus(contract, currentTimeMs);

  // Terminal states cannot transition
  if (contract.status === "completed" || contract.status === "violated") {
    return { success: false, reason: "Contract is already terminal" };
  }

  // Valid transitions:
  // pending -> active (time-based, automatic)
  // pending -> cancelled (manual, not implemented yet)
  // active -> completed (manual)
  // active -> violated (manual)
  // active -> expired (time-based, automatic)
  // expired -> completed (manual, late completion)
  // expired -> violated (manual, acceptance)

  const validTransitions: Record<ContractStatus, ContractStatus[]> = {
    pending: ["active"],
    active: ["completed", "violated", "expired"],
    expired: ["completed", "violated"],
    completed: [],
    violated: [],
  };

  const allowed = validTransitions[currentStatus];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      reason: `Cannot transition from ${currentStatus} to ${newStatus}`,
    };
  }

  return { success: true, newStatus };
}

// ---------------------------------------------------------------------------
// Batch Operations
// ---------------------------------------------------------------------------

/**
 * Refresh all contracts - update statuses based on current time
 * Call this periodically (e.g., every minute or on focus)
 */
export function refreshContracts(
  contracts: Contract[],
  currentTimeMs: number
): Contract[] {
  return contracts.map((c) => {
    const newStatus = calculateContractStatus(c, currentTimeMs);
    if (newStatus !== c.status) {
      return { ...c, status: newStatus };
    }
    return c;
  });
}

/**
 * Get contracts that need attention (active or expired)
 */
export function getAttentionContracts(
  contracts: Contract[],
  currentTimeMs: number
): Contract[] {
  return contracts.filter((c) => {
    const status = calculateContractStatus(c, currentTimeMs);
    return status === "active" || status === "expired";
  });
}
