/**
 * Phase 5 — Identity Layer v1 tests.
 */
import { describe, it, expect } from "vitest";
import {
  computeIdentitySignals,
  IDENTITY_REASON_CODES,
} from "@/lib/ai/identityEngine";

describe("computeIdentitySignals", () => {
  it("escalationLevel >= 2 → mood protective + stance grounding + reasons include ESCALATION_HIGH", () => {
    const r = computeIdentitySignals({
      escalationLevel: 2,
      boundarySeverity: 0,
      contradictionDetected: false,
      earnedValidationLevel: 0,
      projectionLevel: 0,
    });
    expect(r.mood).toBe("protective");
    expect(r.stance).toBe("grounding");
    expect(r.reasons).toContain("ESCALATION_HIGH");
  });

  it("boundarySeverity 2 → mood hurt + stance boundary_enforce + standardsLevel 3", () => {
    const r = computeIdentitySignals({
      escalationLevel: 0,
      boundarySeverity: 2,
      contradictionDetected: false,
    });
    expect(r.mood).toBe("hurt");
    expect(r.stance).toBe("boundary_enforce");
    expect(r.standardsLevel).toBe(3);
    expect(r.reasons).toContain("BOUNDARY_SEVERITY_2");
  });

  it("earnedValidation high → mood encouraged", () => {
    const r = computeIdentitySignals({
      escalationLevel: 0,
      boundarySeverity: 0,
      contradictionDetected: false,
      earnedValidationLevel: 2,
      projectionLevel: 0,
    });
    expect(r.mood).toBe("encouraged");
    expect(r.reasons).toContain("EARNED_VALIDATION_HIGH");
  });

  it("contradiction → stance reality_check", () => {
    const r = computeIdentitySignals({
      escalationLevel: 0,
      boundarySeverity: 0,
      contradictionDetected: true,
      earnedValidationLevel: 0,
      projectionLevel: 0,
    });
    expect(r.stance).toBe("reality_check");
    expect(r.reasons).toContain("CONTRADICTION_DETECTED");
  });

  it("reason codes all from allowlist", () => {
    const r = computeIdentitySignals({
      escalationLevel: 2,
      boundarySeverity: 2,
      contradictionDetected: true,
      earnedValidationLevel: 2,
      projectionLevel: 2,
      firmnessLevel: 3,
    });
    for (const code of r.reasons) {
      expect(IDENTITY_REASON_CODES).toContain(code);
    }
  });

  it("boundarySeverity 1 → standardsLevel 2, mood firm, stance boundary_enforce", () => {
    const r = computeIdentitySignals({
      escalationLevel: 0,
      boundarySeverity: 1,
    });
    expect(r.standardsLevel).toBe(2);
    expect(r.mood).toBe("firm");
    expect(r.stance).toBe("boundary_enforce");
  });

  it("default low-input → calm, soft_support, standards 0", () => {
    const r = computeIdentitySignals({
      escalationLevel: 0,
      boundarySeverity: 0,
      contradictionDetected: false,
      earnedValidationLevel: 0,
      projectionLevel: 0,
    });
    expect(r.mood).toBe("calm");
    expect(r.stance).toBe("soft_support");
    expect(r.standardsLevel).toBe(0);
    expect(r.reasons).toEqual([]);
  });
});
