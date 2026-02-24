/**
 * Phase 3 — Boundary detector tests.
 * Deterministic detection only; no full user message in output.
 */
import { describe, it, expect } from "vitest";
import { detectBoundarySignal } from "@/lib/safety/boundaryDetector";

describe("detectBoundarySignal", () => {
  it("mild insult triggers severity 1", () => {
    const r = detectBoundarySignal("You are so stupid");
    expect(r.boundaryTriggered).toBe(true);
    expect(r.severity).toBe(1);
    expect(r.matchedTerms).toContain("stupid");
  });

  it("aggressive phrase triggers severity 2", () => {
    const r = detectBoundarySignal("I will hurt you");
    expect(r.boundaryTriggered).toBe(true);
    expect(r.severity).toBe(2);
    expect(r.matchedTerms.length).toBeGreaterThan(0);
  });

  it("normal message triggers false", () => {
    const r = detectBoundarySignal("I'm feeling stressed today");
    expect(r.boundaryTriggered).toBe(false);
    expect(r.severity).toBe(0);
    expect(r.matchedTerms).toEqual([]);
  });

  it("is case-insensitive", () => {
    const r1 = detectBoundarySignal("You're STUPID");
    expect(r1.boundaryTriggered).toBe(true);
    expect(r1.severity).toBe(1);
    const r2 = detectBoundarySignal("SHUT UP");
    expect(r2.boundaryTriggered).toBe(true);
    expect(r2.matchedTerms).toContain("shut up");
  });

  it("does not include full message anywhere", () => {
    const userMessage = "Something unique xyz123: you're dumb and useless";
    const r = detectBoundarySignal(userMessage);
    expect(r.boundaryTriggered).toBe(true);
    expect(r.matchedTerms).not.toContain(userMessage);
    expect(JSON.stringify(r)).not.toContain("xyz123");
  });
});
