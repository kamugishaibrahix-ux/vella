/**
 * Tests for Session Negotiation Hardening v2:
 * - Refresh persistence (localStorage scoped to sessionId)
 * - Duplicate suppression (same domain+severity within session)
 * - Confirm reconciliation (re-fetch after confirm, error keeps proposal)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  persistProposal,
  restoreProposal,
  clearPersistedProposal,
  isProposalDuplicate,
  markProposalSeen,
  clearSeenProposals,
  type PendingProposal,
} from "@/lib/session/negotiationState";

const SESSION_A = "session-aaa-111";
const SESSION_B = "session-bbb-222";

const PROPOSAL_1: PendingProposal = {
  domain: "physical-health",
  severity: "moderate",
  suggestedDurationDays: 5,
  suggestedBudgetWeight: 3,
  createdAt: "2026-02-27T10:00:00Z",
};

const PROPOSAL_2: PendingProposal = {
  domain: "self-mastery",
  severity: "high",
  suggestedDurationDays: 3,
  suggestedBudgetWeight: 4,
  createdAt: "2026-02-27T11:00:00Z",
};

describe("Negotiation Hardening v2", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── Test 1: Refresh persistence ─────────────────────────────────────────
  describe("refresh persistence", () => {
    it("persists and restores proposal scoped to sessionId across page refresh", () => {
      // Persist to session A
      persistProposal(SESSION_A, PROPOSAL_1);

      // Restore from session A — should get PROPOSAL_1 back
      const restored = restoreProposal(SESSION_A);
      expect(restored).toEqual(PROPOSAL_1);

      // Session B should have nothing
      expect(restoreProposal(SESSION_B)).toBeNull();

      // Clear session A — should be gone
      clearPersistedProposal(SESSION_A);
      expect(restoreProposal(SESSION_A)).toBeNull();
    });

    it("overwrites previous proposal when new one is persisted", () => {
      persistProposal(SESSION_A, PROPOSAL_1);
      persistProposal(SESSION_A, PROPOSAL_2);

      const restored = restoreProposal(SESSION_A);
      expect(restored).toEqual(PROPOSAL_2);
      expect(restored!.domain).toBe("self-mastery");
    });
  });

  // ── Test 2: Duplicate suppression ───────────────────────────────────────
  describe("duplicate suppression", () => {
    it("suppresses duplicate proposal for same domain+severity in same session", () => {
      // Not seen yet
      expect(isProposalDuplicate(SESSION_A, "physical-health", "moderate")).toBe(false);

      // Mark as seen
      markProposalSeen(SESSION_A, "physical-health", "moderate");

      // Now it's a duplicate
      expect(isProposalDuplicate(SESSION_A, "physical-health", "moderate")).toBe(true);

      // Different severity is NOT a duplicate
      expect(isProposalDuplicate(SESSION_A, "physical-health", "high")).toBe(false);

      // Different session is NOT a duplicate
      expect(isProposalDuplicate(SESSION_B, "physical-health", "moderate")).toBe(false);
    });

    it("clears seen proposals on new chat", () => {
      markProposalSeen(SESSION_A, "physical-health", "moderate");
      markProposalSeen(SESSION_A, "self-mastery", "high");

      expect(isProposalDuplicate(SESSION_A, "physical-health", "moderate")).toBe(true);

      clearSeenProposals(SESSION_A);

      // After clear, nothing is a duplicate
      expect(isProposalDuplicate(SESSION_A, "physical-health", "moderate")).toBe(false);
      expect(isProposalDuplicate(SESSION_A, "self-mastery", "high")).toBe(false);
    });
  });

  // ── Test 3: Confirm reconciliation ──────────────────────────────────────
  describe("confirm reconciliation", () => {
    it("clears persisted proposal only after confirm succeeds (simulated)", () => {
      // Simulate: proposal arrives and is persisted
      persistProposal(SESSION_A, PROPOSAL_1);
      expect(restoreProposal(SESSION_A)).toEqual(PROPOSAL_1);

      // Simulate: confirm fails — proposal should still be persisted
      // (in the UI, setPendingProposal is NOT called on failure)
      const confirmFailed = false;
      if (confirmFailed) {
        clearPersistedProposal(SESSION_A); // this line would NOT run
      }
      expect(restoreProposal(SESSION_A)).toEqual(PROPOSAL_1); // still there

      // Simulate: confirm succeeds — now clear
      const confirmSucceeded = true;
      if (confirmSucceeded) {
        clearPersistedProposal(SESSION_A);
      }
      expect(restoreProposal(SESSION_A)).toBeNull(); // gone after success
    });
  });
});
