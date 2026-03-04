/**
 * Tests for Session Negotiation State Machine — pure deterministic transitions.
 */

import { describe, it, expect } from "vitest";
import {
  INITIAL_NEGOTIATION_STATE,
  createProposal,
  markAwaitingConfirmation,
  confirmProposal,
  cancelProposal,
  clearNegotiation,
  type NegotiationState,
  type PendingProposal,
} from "@/lib/session/negotiationState";

const SAMPLE_PROPOSAL: PendingProposal = {
  domain: "physical-health",
  severity: "moderate",
  suggestedDurationDays: 5,
  suggestedBudgetWeight: 3,
  createdAt: "2026-02-27T10:00:00Z",
};

describe("negotiationState", () => {
  describe("INITIAL_NEGOTIATION_STATE", () => {
    it("starts at stage none with null proposal", () => {
      expect(INITIAL_NEGOTIATION_STATE.stage).toBe("none");
      expect(INITIAL_NEGOTIATION_STATE.proposal).toBeNull();
    });
  });

  describe("createProposal", () => {
    it("transitions none → proposed with proposal data", () => {
      const result = createProposal(INITIAL_NEGOTIATION_STATE, SAMPLE_PROPOSAL);
      expect(result.stage).toBe("proposed");
      expect(result.proposal).toEqual(SAMPLE_PROPOSAL);
    });

    it("is a no-op if not in none stage", () => {
      const proposed: NegotiationState = { stage: "proposed", proposal: SAMPLE_PROPOSAL };
      const result = createProposal(proposed, { ...SAMPLE_PROPOSAL, domain: "self-mastery" });
      expect(result).toBe(proposed); // same reference, no change
    });
  });

  describe("markAwaitingConfirmation", () => {
    it("transitions proposed → awaiting_confirmation", () => {
      const proposed: NegotiationState = { stage: "proposed", proposal: SAMPLE_PROPOSAL };
      const result = markAwaitingConfirmation(proposed);
      expect(result.stage).toBe("awaiting_confirmation");
      expect(result.proposal).toEqual(SAMPLE_PROPOSAL);
    });

    it("is a no-op if not in proposed stage", () => {
      const result = markAwaitingConfirmation(INITIAL_NEGOTIATION_STATE);
      expect(result).toBe(INITIAL_NEGOTIATION_STATE);
    });
  });

  describe("confirmProposal", () => {
    it("transitions awaiting_confirmation → confirmed", () => {
      const awaiting: NegotiationState = { stage: "awaiting_confirmation", proposal: SAMPLE_PROPOSAL };
      const result = confirmProposal(awaiting);
      expect(result.stage).toBe("confirmed");
      expect(result.proposal).toEqual(SAMPLE_PROPOSAL);
    });

    it("is a no-op if not in awaiting_confirmation stage", () => {
      const proposed: NegotiationState = { stage: "proposed", proposal: SAMPLE_PROPOSAL };
      const result = confirmProposal(proposed);
      expect(result).toBe(proposed);
    });
  });

  describe("cancelProposal", () => {
    it("transitions proposed → cancelled, clears proposal", () => {
      const proposed: NegotiationState = { stage: "proposed", proposal: SAMPLE_PROPOSAL };
      const result = cancelProposal(proposed);
      expect(result.stage).toBe("cancelled");
      expect(result.proposal).toBeNull();
    });

    it("transitions awaiting_confirmation → cancelled", () => {
      const awaiting: NegotiationState = { stage: "awaiting_confirmation", proposal: SAMPLE_PROPOSAL };
      const result = cancelProposal(awaiting);
      expect(result.stage).toBe("cancelled");
      expect(result.proposal).toBeNull();
    });

    it("is a no-op from none stage", () => {
      const result = cancelProposal(INITIAL_NEGOTIATION_STATE);
      expect(result).toBe(INITIAL_NEGOTIATION_STATE);
    });

    it("is a no-op from confirmed stage", () => {
      const confirmed: NegotiationState = { stage: "confirmed", proposal: SAMPLE_PROPOSAL };
      const result = cancelProposal(confirmed);
      expect(result).toBe(confirmed);
    });
  });

  describe("clearNegotiation", () => {
    it("resets confirmed → none", () => {
      const confirmed: NegotiationState = { stage: "confirmed", proposal: SAMPLE_PROPOSAL };
      const result = clearNegotiation(confirmed);
      expect(result.stage).toBe("none");
      expect(result.proposal).toBeNull();
    });

    it("resets cancelled → none", () => {
      const cancelled: NegotiationState = { stage: "cancelled", proposal: null };
      const result = clearNegotiation(cancelled);
      expect(result.stage).toBe("none");
      expect(result.proposal).toBeNull();
    });

    it("is a no-op from proposed stage", () => {
      const proposed: NegotiationState = { stage: "proposed", proposal: SAMPLE_PROPOSAL };
      const result = clearNegotiation(proposed);
      expect(result).toBe(proposed);
    });

    it("is a no-op from none stage", () => {
      const result = clearNegotiation(INITIAL_NEGOTIATION_STATE);
      expect(result).toBe(INITIAL_NEGOTIATION_STATE);
    });
  });

  describe("full lifecycle", () => {
    it("none → proposed → awaiting → confirmed → none", () => {
      let state: NegotiationState = INITIAL_NEGOTIATION_STATE;
      state = createProposal(state, SAMPLE_PROPOSAL);
      expect(state.stage).toBe("proposed");
      state = markAwaitingConfirmation(state);
      expect(state.stage).toBe("awaiting_confirmation");
      state = confirmProposal(state);
      expect(state.stage).toBe("confirmed");
      state = clearNegotiation(state);
      expect(state.stage).toBe("none");
      expect(state.proposal).toBeNull();
    });

    it("none → proposed → cancelled → none", () => {
      let state: NegotiationState = INITIAL_NEGOTIATION_STATE;
      state = createProposal(state, SAMPLE_PROPOSAL);
      expect(state.stage).toBe("proposed");
      state = cancelProposal(state);
      expect(state.stage).toBe("cancelled");
      state = clearNegotiation(state);
      expect(state.stage).toBe("none");
    });
  });
});
