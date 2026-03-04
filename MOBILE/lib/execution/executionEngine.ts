/**
 * EXECUTION ENGINE
 * ================
 * Personal OS execution enforcement layer.
 * Integrates contracts with the enforcement gate to provide
 * execution-time validation and enforcement capabilities.
 *
 * Compliance: Behaviour OS Architecture
 * Principle: Contracts drive execution, enforcement gate validates,
 * execution engine integrates both for unified enforcement.
 *
 * @module lib/execution/executionEngine
 */

import type { EnforcementResult, EnforcementInput } from "@/lib/system/enforcementGate";
import { getUserExecutionGate, REASON_CODES } from "@/lib/system/enforcementGate";
import type { ResourceBudget } from "@/lib/system/resourceBudgetEngine";
import type { MasterStateOutput } from "@/lib/system/masterStateEngine";
import type { GovernanceState } from "@/lib/system/masterStateEngine";
import type { PlanEntitlement } from "@/lib/plans/types";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Active contract from contracts_current table.
 */
export interface ActiveContract {
  id: string;
  user_id: string;
  domain: string;
  severity: "low" | "moderate" | "high";
  enforcement_mode: "observe" | "soft" | "strict";
  title: string;
  description: string;
  expires_at: string;
  status: "active" | "completed" | "violated";
  created_at: string;
}

/**
 * Execution mode derived from system state and contracts.
 */
export type ExecutionMode =
  | "normal" // Standard operation, no special restrictions
  | "focus" // Focus mode - reduced distractions, enforced check-ins
  | "recovery" // Recovery mode - gentle guidance, support-oriented
  | "discipline" // Discipline mode - strict enforcement, hard blocks
  | "overload"; // System overload - minimal features, basic functions only

/**
 * Validation result for an action.
 */
export interface ActionValidation {
  allowed: boolean;
  mode: ExecutionMode;
  reasonCodes: string[];
  contractIds: string[];
  requiresCheckIn: boolean;
  focusRedirect: boolean;
  message?: string;
}

/**
 * Execution context for a user session.
 */
export interface ExecutionContext {
  userId: string;
  mode: ExecutionMode;
  contracts: ActiveContract[];
  enforcement: EnforcementResult;
  timestamp: number;
}

/**
 * Action types that can be validated.
 */
export type UserAction =
  | "send_message"
  | "start_focus_session"
  | "access_premium"
  | "view_deep_memory"
  | "journal_entry"
  | "check_in"
  | "create_commitment"
  | "modify_settings";

// ============================================================================
// EXECUTION MODE DERIVATION
// ============================================================================

/**
 * Derives the execution mode from system state and active contracts.
 *
 * Mode precedence (highest to lowest):
 * 1. overload - System is overloaded, minimal operation
 * 2. discipline - Active strict contract requiring hard enforcement
 * 3. recovery - Relapse state or recovery contract active
 * 4. focus - Focus contract active
 * 5. normal - Standard operation
 */
export function deriveExecutionMode(
  contracts: ActiveContract[],
  enforcement: EnforcementResult,
  masterState?: MasterStateOutput | null,
): ExecutionMode {
  // Check for overload state
  if (
    enforcement.reasonCodes.includes(REASON_CODES.OVERLOAD_ACTIVE) ||
    enforcement.reasonCodes.includes(REASON_CODES.BUDGET_CRITICAL)
  ) {
    return "overload";
  }

  // Check for discipline mode (strict contracts)
  const hasStrictContract = contracts.some((c) => c.enforcement_mode === "strict" && c.status === "active");
  if (hasStrictContract) {
    return "discipline";
  }

  // Check for recovery mode
  const hasRecoveryContract = contracts.some(
    (c) => c.domain === "recovery" && c.status === "active"
  );
  if (hasRecoveryContract || enforcement.reasonCodes.includes(REASON_CODES.RELAPSE_STATE)) {
    return "recovery";
  }

  // Check for focus mode
  const hasFocusContract = contracts.some(
    (c) =>
      (c.domain === "performance" || c.domain === "cognitive") &&
      c.status === "active" &&
      c.enforcement_mode !== "observe"
  );
  if (hasFocusContract) {
    return "focus";
  }

  return "normal";
}

// ============================================================================
// CONTRACT INTEGRATION
// ============================================================================

/**
 * Validates an action against active contracts.
 * Returns contracts that apply to this action.
 */
export function getRelevantContracts(
  action: UserAction,
  contracts: ActiveContract[],
): ActiveContract[] {
  const domainMap: Record<UserAction, string[]> = {
    send_message: ["communication", "addiction", "recovery"],
    start_focus_session: ["performance", "cognitive", "addiction"],
    access_premium: ["identity", "performance"],
    view_deep_memory: ["identity", "cognitive"],
    journal_entry: ["identity", "recovery", "health"],
    check_in: ["health", "recovery", "performance"],
    create_commitment: ["governance", "identity"],
    modify_settings: ["governance", "identity"],
  };

  const relevantDomains = domainMap[action] || [];

  return contracts.filter(
    (c) =>
      c.status === "active" &&
      (relevantDomains.includes(c.domain) || c.domain === "identity")
  );
}

/**
 * Checks if an action requires additional validation based on contracts.
 */
export function requiresAdditionalValidation(
  action: UserAction,
  contracts: ActiveContract[],
): boolean {
  const relevant = getRelevantContracts(action, contracts);
  return relevant.some((c) => c.enforcement_mode !== "observe");
}

// ============================================================================
// ACTION VALIDATION
// ============================================================================

/**
 * Validates a user action against execution rules and contracts.
 * This is the primary function for execution-time validation.
 *
 * @param action - The action the user wants to perform
 * @param context - Current execution context
 * @returns Validation result with mode and restrictions
 */
export function validateExecution(
  action: UserAction,
  context: ExecutionContext,
): ActionValidation {
  const { enforcement, contracts, mode } = context;

  // Start with base validation from enforcement gate
  let allowed = true;
  let requiresCheckIn = false;
  let focusRedirect = false;
  const contractIds: string[] = [];
  const additionalReasons: string[] = [];

  // Get relevant contracts for this action
  const relevantContracts = getRelevantContracts(action, contracts);
  contractIds.push(...relevantContracts.map((c) => c.id));

  // Check enforcement gate permissions
  switch (action) {
    case "send_message":
      allowed = enforcement.canSend;
      if (!allowed) {
        additionalReasons.push(REASON_CODES.TOKENS_DEPLETED);
      }
      break;

    case "start_focus_session":
      allowed = enforcement.canStartFocus;
      if (!allowed) {
        additionalReasons.push(REASON_CODES.OVERLOAD_ACTIVE);
        focusRedirect = true;
      }
      break;

    case "access_premium":
    case "view_deep_memory":
      allowed = enforcement.canAccessPremium;
      if (!allowed) {
        additionalReasons.push(REASON_CODES.NOT_PAID);
        additionalReasons.push(REASON_CODES.PREMIUM_FEATURE_GATED);
      }
      break;

    case "journal_entry":
    case "check_in":
      // Always allowed but may trigger contract validation
      requiresCheckIn = mode === "recovery" || mode === "discipline";
      break;

    case "create_commitment":
    case "modify_settings":
      // Check if in critical budget state
      if (mode === "overload") {
        allowed = false;
        additionalReasons.push(REASON_CODES.BUDGET_CRITICAL);
      }
      break;
  }

  // Apply contract-specific restrictions
  for (const contract of relevantContracts) {
    if (contract.enforcement_mode === "strict" && contract.status === "active") {
      // Strict mode may block actions that would violate contract domain
      if (action === "send_message" && contract.domain === "addiction") {
        // Additional validation needed
        requiresCheckIn = true;
      }
    }
  }

  // Build reason codes array
  const reasonCodes = [...enforcement.reasonCodes, ...additionalReasons];

  // Build message based on mode and restrictions
  let message: string | undefined;
  if (!allowed) {
    if (mode === "overload") {
      message = "System is in overload state. Basic functions only.";
    } else if (mode === "discipline") {
      message = "Strict enforcement active. Complete required check-in first.";
    } else if (mode === "recovery") {
      message = "Recovery mode active. Take a moment to check in.";
    }
  }

  return {
    allowed,
    mode,
    reasonCodes,
    contractIds,
    requiresCheckIn,
    focusRedirect,
    message,
  };
}

// ============================================================================
// EXECUTION CONTEXT BUILDING
// ============================================================================

/**
 * Builds an execution context from component state.
 * This function aggregates state from multiple sources.
 */
export function buildExecutionContext(
  userId: string,
  contracts: ActiveContract[],
  enforcementInput: EnforcementInput,
): ExecutionContext {
  const enforcement = getUserExecutionGate(enforcementInput);
  const mode = deriveExecutionMode(contracts, enforcement, enforcementInput.masterState);

  return {
    userId,
    mode,
    contracts,
    enforcement,
    timestamp: Date.now(),
  };
}

// ============================================================================
// MODE-SPECIFIC HELPERS
// ============================================================================

/**
 * Returns UI configuration for the current execution mode.
 */
export function getModeUIConfig(mode: ExecutionMode) {
  const configs: Record<ExecutionMode, { theme: string; alertLevel: "none" | "info" | "warning" | "critical"; banner?: string }> = {
    normal: {
      theme: "default",
      alertLevel: "none",
    },
    focus: {
      theme: "focus",
      alertLevel: "info",
      banner: "Focus mode active. Stay on track.",
    },
    recovery: {
      theme: "recovery",
      alertLevel: "warning",
      banner: "Recovery mode active. Be gentle with yourself.",
    },
    discipline: {
      theme: "discipline",
      alertLevel: "critical",
      banner: "Strict enforcement active. Complete required actions.",
    },
    overload: {
      theme: "minimal",
      alertLevel: "critical",
      banner: "System overloaded. Basic functions only.",
    },
  };

  return configs[mode];
}

/**
 * Returns allowed features for the current execution mode.
 */
export function getAllowedFeatures(mode: ExecutionMode): {
  chat: boolean;
  focus: boolean;
  insights: boolean;
  deepMemory: boolean;
  settings: boolean;
} {
  const featureMap: Record<ExecutionMode, { chat: boolean; focus: boolean; insights: boolean; deepMemory: boolean; settings: boolean }> = {
    normal: { chat: true, focus: true, insights: true, deepMemory: true, settings: true },
    focus: { chat: true, focus: true, insights: false, deepMemory: false, settings: false },
    recovery: { chat: true, focus: false, insights: true, deepMemory: false, settings: true },
    discipline: { chat: false, focus: false, insights: false, deepMemory: false, settings: false },
    overload: { chat: false, focus: false, insights: false, deepMemory: false, settings: false },
  };

  return featureMap[mode];
}

// ============================================================================
// CONTRACT ENFORCEMENT
// ============================================================================

/**
 * Enforces a specific contract by ID.
 * Returns the enforcement action taken.
 */
export function enforceContract(
  contractId: string,
  contracts: ActiveContract[],
): { success: boolean; action?: string; error?: string } {
  const contract = contracts.find((c) => c.id === contractId);

  if (!contract) {
    return { success: false, error: "Contract not found" };
  }

  if (contract.status !== "active") {
    return { success: false, error: "Contract not active" };
  }

  // Apply enforcement based on mode
  switch (contract.enforcement_mode) {
    case "observe":
      return { success: true, action: "observe_only" };

    case "soft":
      return { success: true, action: "soft_prompt" };

    case "strict":
      return { success: true, action: "hard_block" };

    default:
      return { success: false, error: "Unknown enforcement mode" };
  }
}

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

/**
 * Execution Engine Module Exports:
 *
 * Types:
 * - ActiveContract: Contract from contracts_current table
 * - ExecutionMode: Derived execution state (normal/focus/recovery/discipline/overload)
 * - ActionValidation: Result of validating a user action
 * - ExecutionContext: Complete execution state for a user
 * - UserAction: Union type of validatable actions
 *
 * Functions:
 * - deriveExecutionMode(contracts, enforcement, masterState?): Determine execution mode
 * - getRelevantContracts(action, contracts): Get contracts applicable to an action
 * - requiresAdditionalValidation(action, contracts): Check if extra validation needed
 * - validateExecution(action, context): Primary validation function
 * - buildExecutionContext(userId, contracts, enforcementInput): Build context from state
 * - getModeUIConfig(mode): Get UI configuration for mode
 * - getAllowedFeatures(mode): Get feature availability for mode
 * - enforceContract(contractId, contracts): Enforce a specific contract
 *
 * Usage:
 * ```typescript
 * import { validateExecution, buildExecutionContext } from "@/lib/execution/executionEngine";
 *
 * // Build execution context from current state
 * const context = buildExecutionContext(userId, activeContracts, {
 *   governanceState, masterState, tokensRemaining, entitlements
 * });
 *
 * // Validate an action
 * const validation = validateExecution("send_message", context);
 *
 * if (!validation.allowed) {
 *   // Show enforcement UI
 *   return { blocked: true, reason: validation.message };
 * }
 *
 * // Proceed with action
 * ```
 */
