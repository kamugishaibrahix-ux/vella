/**
 * Tests for Session Proposal Detector — deterministic detection of contract-worthy patterns.
 */

import { describe, it, expect } from "vitest";
import { detectProposal, type ProposalDetectionInput } from "@/lib/session/proposalDetector";

function makeInput(overrides: Partial<ProposalDetectionInput> = {}): ProposalDetectionInput {
  return {
    contradictionDetected: false,
    recentCommitmentViolations: 0,
    recentAbstinenceViolations: 0,
    riskScore: 30,
    escalationLevel: 0,
    topPriorityDomain: "health",
    urgencyLevel: 50,
    enforcementMode: "soft",
    selectedDomains: ["physical-health", "self-mastery"],
    ...overrides,
  };
}

describe("detectProposal", () => {
  describe("returns null (no proposal)", () => {
    it("when no triggers are met", () => {
      const result = detectProposal(makeInput());
      expect(result).toBeNull();
    });

    it("when enforcement mode is observe", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        enforcementMode: "observe",
      }));
      expect(result).toBeNull();
    });

    it("when no selected domains", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        selectedDomains: [],
      }));
      expect(result).toBeNull();
    });
  });

  describe("triggers proposal", () => {
    it("when contradictionDetected is true", () => {
      const result = detectProposal(makeInput({ contradictionDetected: true }));
      expect(result).not.toBeNull();
      expect(result!.domain).toBe("physical-health"); // mapped from "health"
      expect(result!.severity).toBe("moderate"); // urgencyLevel=50
    });

    it("when recentCommitmentViolations >= 2", () => {
      const result = detectProposal(makeInput({ recentCommitmentViolations: 2 }));
      expect(result).not.toBeNull();
    });

    it("when recentAbstinenceViolations >= 1", () => {
      const result = detectProposal(makeInput({ recentAbstinenceViolations: 1 }));
      expect(result).not.toBeNull();
    });

    it("when riskScore >= 60", () => {
      const result = detectProposal(makeInput({ riskScore: 60 }));
      expect(result).not.toBeNull();
    });
  });

  describe("domain resolution", () => {
    it("maps system domain to FocusDomain when in selected domains", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        topPriorityDomain: "health",
        selectedDomains: ["physical-health", "self-mastery"],
      }));
      expect(result!.domain).toBe("physical-health");
    });

    it("falls back to first selected domain when system domain not in selections", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        topPriorityDomain: "finance",
        selectedDomains: ["self-mastery", "relationships"],
      }));
      expect(result!.domain).toBe("self-mastery");
    });

    it("falls back to first selected domain when system domain is null", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        topPriorityDomain: null,
        selectedDomains: ["addiction-recovery"],
      }));
      expect(result!.domain).toBe("addiction-recovery");
    });
  });

  describe("severity derivation", () => {
    it("returns high for urgencyLevel >= 80", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        urgencyLevel: 80,
      }));
      expect(result!.severity).toBe("high");
      expect(result!.suggestedDurationDays).toBe(3);
      expect(result!.suggestedBudgetWeight).toBe(4);
    });

    it("returns moderate for urgencyLevel 50-79", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        urgencyLevel: 65,
      }));
      expect(result!.severity).toBe("moderate");
      expect(result!.suggestedDurationDays).toBe(5);
      expect(result!.suggestedBudgetWeight).toBe(3);
    });

    it("returns low for urgencyLevel < 50", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        urgencyLevel: 30,
      }));
      expect(result!.severity).toBe("low");
      expect(result!.suggestedDurationDays).toBe(7);
      expect(result!.suggestedBudgetWeight).toBe(2);
    });

    it("defaults to moderate when urgencyLevel is null", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        urgencyLevel: null,
      }));
      expect(result!.severity).toBe("moderate");
    });
  });

  describe("enforcement mode", () => {
    it("allows proposal in soft mode", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        enforcementMode: "soft",
      }));
      expect(result).not.toBeNull();
    });

    it("allows proposal in strict mode", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        enforcementMode: "strict",
      }));
      expect(result).not.toBeNull();
    });

    it("allows proposal when enforcement mode is null", () => {
      const result = detectProposal(makeInput({
        contradictionDetected: true,
        enforcementMode: null,
      }));
      expect(result).not.toBeNull();
    });
  });

  describe("createdAt", () => {
    it("includes a valid ISO timestamp", () => {
      const result = detectProposal(makeInput({ contradictionDetected: true }));
      expect(result!.createdAt).toBeTruthy();
      expect(new Date(result!.createdAt).toISOString()).toBe(result!.createdAt);
    });
  });
});
