/**
 * Session Negotiation State Machine — Deterministic, pure transitions.
 * No side effects. No DB. No LLM autonomy.
 * Contracts must ONLY be created after explicit user confirmation.
 */

import type { FocusDomain } from "@/lib/focusAreas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NegotiationStage =
  | "none"
  | "proposed"
  | "awaiting_confirmation"
  | "confirmed"
  | "cancelled";

export type PendingProposal = {
  domain: FocusDomain;
  severity: "low" | "moderate" | "high";
  suggestedDurationDays: number;
  suggestedBudgetWeight: number;
  createdAt: string;
};

export type NegotiationState = {
  stage: NegotiationStage;
  proposal: PendingProposal | null;
};

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const INITIAL_NEGOTIATION_STATE: NegotiationState = {
  stage: "none",
  proposal: null,
};

// ---------------------------------------------------------------------------
// Pure transition helpers
// ---------------------------------------------------------------------------

/** Transition: none → proposed. Sets proposal data. */
export function createProposal(
  state: NegotiationState,
  proposal: PendingProposal,
): NegotiationState {
  if (state.stage !== "none") return state;
  return { stage: "proposed", proposal };
}

/** Transition: proposed → awaiting_confirmation. */
export function markAwaitingConfirmation(
  state: NegotiationState,
): NegotiationState {
  if (state.stage !== "proposed") return state;
  return { ...state, stage: "awaiting_confirmation" };
}

/** Transition: awaiting_confirmation → confirmed. */
export function confirmProposal(
  state: NegotiationState,
): NegotiationState {
  if (state.stage !== "awaiting_confirmation") return state;
  return { ...state, stage: "confirmed" };
}

/** Transition: proposed | awaiting_confirmation → cancelled. Clears proposal. */
export function cancelProposal(
  state: NegotiationState,
): NegotiationState {
  if (state.stage !== "proposed" && state.stage !== "awaiting_confirmation") {
    return state;
  }
  return { stage: "cancelled", proposal: null };
}

/** Reset to initial state from any terminal stage (confirmed | cancelled). */
export function clearNegotiation(
  state: NegotiationState,
): NegotiationState {
  if (state.stage !== "confirmed" && state.stage !== "cancelled") return state;
  return { stage: "none", proposal: null };
}

// ---------------------------------------------------------------------------
// localStorage persistence (scoped to sessionId)
// ---------------------------------------------------------------------------

const PROPOSAL_STORAGE_PREFIX = "vella-proposal:";
const SEEN_STORAGE_PREFIX = "vella-proposal-seen:";

function proposalKey(sessionId: string): string {
  return `${PROPOSAL_STORAGE_PREFIX}${sessionId}`;
}

function seenKey(sessionId: string): string {
  return `${SEEN_STORAGE_PREFIX}${sessionId}`;
}

/** Persist pending proposal to localStorage scoped to sessionId. */
export function persistProposal(sessionId: string, proposal: PendingProposal | null): void {
  try {
    const key = proposalKey(sessionId);
    if (proposal) {
      localStorage.setItem(key, JSON.stringify(proposal));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable — degrade silently
  }
}

/** Restore pending proposal from localStorage for a given sessionId. */
export function restoreProposal(sessionId: string): PendingProposal | null {
  try {
    const raw = localStorage.getItem(proposalKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as PendingProposal;
  } catch {
    return null;
  }
}

/** Clear persisted proposal for a session. */
export function clearPersistedProposal(sessionId: string): void {
  try {
    localStorage.removeItem(proposalKey(sessionId));
  } catch {
    // degrade silently
  }
}

// ---------------------------------------------------------------------------
// Duplicate suppression (same domain+severity within one session)
// ---------------------------------------------------------------------------

/** Build a dedup fingerprint for a proposal. */
function proposalFingerprint(domain: string, severity: string): string {
  return `${domain}::${severity}`;
}

/** Check if a proposal with same domain+severity was already seen in this session. */
export function isProposalDuplicate(
  sessionId: string,
  domain: string,
  severity: string,
): boolean {
  try {
    const raw = localStorage.getItem(seenKey(sessionId));
    if (!raw) return false;
    const seen: string[] = JSON.parse(raw);
    return seen.includes(proposalFingerprint(domain, severity));
  } catch {
    return false;
  }
}

/** Mark a proposal domain+severity as seen for this session. */
export function markProposalSeen(
  sessionId: string,
  domain: string,
  severity: string,
): void {
  try {
    const key = seenKey(sessionId);
    const raw = localStorage.getItem(key);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    const fp = proposalFingerprint(domain, severity);
    if (!seen.includes(fp)) {
      seen.push(fp);
      localStorage.setItem(key, JSON.stringify(seen));
    }
  } catch {
    // degrade silently
  }
}

/** Clear all seen proposals for a session (e.g. on new chat). */
export function clearSeenProposals(sessionId: string): void {
  try {
    localStorage.removeItem(seenKey(sessionId));
  } catch {
    // degrade silently
  }
}
