/**
 * Phase 2 — Commitment Contradiction Engine unit tests.
 */
import { describe, it, expect } from "vitest";
import { detectCommitmentContradiction } from "@/lib/governance/contradiction";

describe("detectCommitmentContradiction", () => {
  it("returns no contradiction when no commitments", () => {
    const result = detectCommitmentContradiction("I might drink tonight", []);
    expect(result.contradictionDetected).toBe(false);
    expect(result.contradictedCommitmentIds).toEqual([]);
  });

  it("returns false when commitment active but no keyword in message", () => {
    const result = detectCommitmentContradiction("I had a good day today", [
      { id: "c1", subject_code: "alcohol" },
    ]);
    expect(result.contradictionDetected).toBe(false);
    expect(result.contradictedCommitmentIds).toEqual([]);
  });

  it("returns true when commitment active and message contains keyword", () => {
    const result = detectCommitmentContradiction("I think I will drink tonight", [
      { id: "c1", subject_code: "alcohol" },
    ]);
    expect(result.contradictionDetected).toBe(true);
    expect(result.contradictedCommitmentIds).toEqual(["c1"]);
  });

  it("returns correct ids for multiple commitments when multiple match", () => {
    const result = detectCommitmentContradiction("I want to skip and procrastinate", [
      { id: "focus-1", subject_code: "focus" },
      { id: "habit-1", subject_code: "habit" },
    ]);
    expect(result.contradictionDetected).toBe(true);
    expect(result.contradictedCommitmentIds).toContain("focus-1");
    expect(result.contradictedCommitmentIds).toContain("habit-1");
    expect(result.contradictedCommitmentIds.length).toBe(2);
  });

  it("is case insensitive", () => {
    const result = detectCommitmentContradiction("I might DRINK later", [
      { id: "c1", subject_code: "alcohol" },
    ]);
    expect(result.contradictionDetected).toBe(true);
    expect(result.contradictedCommitmentIds).toEqual(["c1"]);
  });

  it("does not duplicate ids when one commitment matches multiple keywords", () => {
    const result = detectCommitmentContradiction("relapse and drink", [
      { id: "c1", subject_code: "alcohol" },
    ]);
    expect(result.contradictionDetected).toBe(true);
    expect(result.contradictedCommitmentIds).toEqual(["c1"]);
  });

  it("handles null subject_code as other", () => {
    const result = detectCommitmentContradiction("I will skip it", [
      { id: "c1", subject_code: null },
    ]);
    expect(result.contradictionDetected).toBe(true);
    expect(result.contradictedCommitmentIds).toEqual(["c1"]);
  });
});
