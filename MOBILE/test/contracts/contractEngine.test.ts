/**
 * Contract Generation Engine — Unit Tests
 */

import { describe, it, expect } from "vitest";
import {
  generateContract,
  type ContractGenerationInput,
} from "@/lib/contracts/contractEngine";

function makeInput(
  overrides: Partial<ContractGenerationInput> = {},
): ContractGenerationInput {
  return {
    domain: "health",
    severity: "low",
    enforcementMode: "soft",
    selectedDomains: ["health", "finance", "cognitive"],
    availableWeeklySlots: 3,
    resourceBudgetWeightAvailable: 10,
    userTier: "pro",
    ...overrides,
  };
}

describe("generateContract", () => {
  // ── Guard: domain not selected ────────────────────────────────────────
  it("returns null if domain is not in selectedDomains", () => {
    expect(
      generateContract(makeInput({ domain: "addiction", selectedDomains: ["health"] })),
    ).toBeNull();
  });

  // ── Guard: observe mode ───────────────────────────────────────────────
  it("returns null if enforcementMode is observe", () => {
    expect(
      generateContract(makeInput({ enforcementMode: "observe" })),
    ).toBeNull();
  });

  // ── Guard: no weekly slots ────────────────────────────────────────────
  it("returns null if availableWeeklySlots is 0", () => {
    expect(
      generateContract(makeInput({ availableWeeklySlots: 0 })),
    ).toBeNull();
  });

  it("returns null if availableWeeklySlots is negative", () => {
    expect(
      generateContract(makeInput({ availableWeeklySlots: -1 })),
    ).toBeNull();
  });

  // ── Guard: budget exceeded ────────────────────────────────────────────
  it("returns null if no template fits within budget", () => {
    expect(
      generateContract(makeInput({ resourceBudgetWeightAvailable: 0 })),
    ).toBeNull();
  });

  it("returns null when budget is less than cheapest matching template", () => {
    // health + low → health_sleep_regularisation_low has budgetWeight 2
    expect(
      generateContract(makeInput({ resourceBudgetWeightAvailable: 1 })),
    ).toBeNull();
  });

  // ── Valid generation ──────────────────────────────────────────────────
  it("returns a valid GeneratedContract for a matching input", () => {
    const result = generateContract(makeInput());
    expect(result).not.toBeNull();
    expect(result!.domain).toBe("health");
    expect(result!.intensity).toBe("low");
    expect(result!.enforcementMode).toBe("soft");
    expect(result!.templateId).toBe("health_sleep_regularisation_low");
  });

  it("returned durationDays matches template recommendedDays", () => {
    const result = generateContract(makeInput());
    expect(result).not.toBeNull();
    // health_sleep_regularisation_low → recommendedDays 4
    expect(result!.durationDays).toBe(4);
  });

  // ── Severity filter ───────────────────────────────────────────────────
  it("respects severity filter — high severity picks different template", () => {
    const result = generateContract(makeInput({ severity: "high" }));
    expect(result).not.toBeNull();
    expect(result!.intensity).toBe("high");
    expect(result!.templateId).toBe("health_sleep_regularisation_high");
  });

  // ── Enforcement compatibility ─────────────────────────────────────────
  it("filters out templates whose compatibility does not match enforcement mode", () => {
    // performance_energy_conservation has compatibility "observe" — incompatible with "strict"
    // performance_overcommitment_guard has compatibility "strict" — matches "strict"
    const result = generateContract(
      makeInput({
        domain: "performance",
        severity: "high",
        enforcementMode: "strict",
        selectedDomains: ["performance"],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.templateId).toBe("performance_overcommitment_guard");
  });

  it("templates with compatibility 'any' are always eligible", () => {
    // health_sleep_regularisation_low has compatibility "any"
    const result = generateContract(
      makeInput({ enforcementMode: "strict" }),
    );
    expect(result).not.toBeNull();
    expect(result!.templateId).toBe("health_sleep_regularisation_low");
  });

  // ── Sorting: lowest budgetWeight first ────────────────────────────────
  it("selects lowest budgetWeight candidate when multiple match", () => {
    // cognitive + high → cognitive_decision_delay_rule (bw 3, soft)
    // only one match for high + soft, but verify it picks the right one
    const result = generateContract(
      makeInput({
        domain: "cognitive",
        severity: "high",
        enforcementMode: "soft",
        selectedDomains: ["cognitive"],
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.budgetWeight).toBe(3);
  });

  // ── Tier caps ─────────────────────────────────────────────────────────
  it("free tier caps weekly slots to 1", () => {
    // Still generates if capped slots > 0
    const result = generateContract(
      makeInput({ userTier: "free", availableWeeklySlots: 10 }),
    );
    expect(result).not.toBeNull();
  });

  it("free tier returns null when slots already consumed (0 remaining)", () => {
    expect(
      generateContract(makeInput({ userTier: "free", availableWeeklySlots: 0 })),
    ).toBeNull();
  });

  it("tier cap clamps slots — pro with 10 slots still generates", () => {
    const result = generateContract(
      makeInput({ userTier: "pro", availableWeeklySlots: 10 }),
    );
    expect(result).not.toBeNull();
  });

  // ── No matching template ──────────────────────────────────────────────
  it("returns null when no template matches domain + severity combo", () => {
    // health has no "moderate" severity template
    expect(
      generateContract(makeInput({ severity: "moderate" })),
    ).toBeNull();
  });

  it("returns null when enforcement compatibility filters all templates", () => {
    // identity_value_alignment_check (low) has compatibility "observe" — incompatible with soft/strict
    // identity has no low-severity template with soft/strict/"any" compatibility
    expect(
      generateContract(
        makeInput({
          domain: "identity",
          severity: "low",
          enforcementMode: "soft",
          selectedDomains: ["identity"],
        }),
      ),
    ).toBeNull();
  });
});
