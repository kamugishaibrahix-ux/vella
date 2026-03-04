/**
 * System Phase Engine — Unit Tests
 */

import { describe, it, expect } from "vitest";
import { computeSystemPhase, extractPhaseInputs, type PhaseInput } from "@/lib/system/phaseEngine";

function makePhaseInput(overrides: Partial<PhaseInput> = {}): PhaseInput {
  return {
    overload_flag: false,
    global_stability_score: 70,
    dominant_risk_domain: "none",
    governance_risk_score: 20,
    recovery_state: "ok",
    volatility_flags: {
      health_volatility: false,
      cognitive_volatility: false,
    },
    confidence_score: 80,
    ...overrides,
  };
}

describe("computeSystemPhase", () => {
  // ─── Precedence 1: overloaded ─────────────────────────────────────────
  it("returns overloaded when overload_flag is true", () => {
    expect(computeSystemPhase(makePhaseInput({ overload_flag: true }))).toBe("overloaded");
  });

  it("overloaded takes precedence over relapse", () => {
    expect(
      computeSystemPhase(
        makePhaseInput({ overload_flag: true, recovery_state: "relapse" }),
      ),
    ).toBe("overloaded");
  });

  // ─── Precedence 2: recovery ───────────────────────────────────────────
  it("returns recovery on relapse state", () => {
    expect(
      computeSystemPhase(makePhaseInput({ recovery_state: "relapse" })),
    ).toBe("recovery");
  });

  it("returns recovery when governance risk score is high", () => {
    expect(
      computeSystemPhase(makePhaseInput({ governance_risk_score: 70 })),
    ).toBe("recovery");
  });

  it("returns recovery at exact threshold (65)", () => {
    expect(
      computeSystemPhase(makePhaseInput({ governance_risk_score: 65 })),
    ).toBe("recovery");
  });

  // ─── Precedence 3: volatile ───────────────────────────────────────────
  it("returns volatile with health volatility and moderate stability", () => {
    expect(
      computeSystemPhase(
        makePhaseInput({
          volatility_flags: { health_volatility: true, cognitive_volatility: false },
          global_stability_score: 60,
        }),
      ),
    ).toBe("volatile");
  });

  it("returns volatile with cognitive volatility", () => {
    expect(
      computeSystemPhase(
        makePhaseInput({
          volatility_flags: { health_volatility: false, cognitive_volatility: true },
          global_stability_score: 50,
        }),
      ),
    ).toBe("volatile");
  });

  it("does NOT return volatile when stability is high (growth takes over)", () => {
    const result = computeSystemPhase(
      makePhaseInput({
        volatility_flags: { health_volatility: true, cognitive_volatility: false },
        global_stability_score: 80,
      }),
    );
    expect(result).not.toBe("volatile");
  });

  // ─── Precedence 4: growth ─────────────────────────────────────────────
  it("returns growth when stability high and stress low", () => {
    expect(
      computeSystemPhase(
        makePhaseInput({ global_stability_score: 80 }),
      ),
    ).toBe("growth");
  });

  it("does not return growth when effective stress > 30", () => {
    expect(
      computeSystemPhase(
        makePhaseInput({ global_stability_score: 69 }),
      ),
    ).not.toBe("growth");
  });

  it("growth only when stability >= 75", () => {
    expect(computeSystemPhase(makePhaseInput({ global_stability_score: 75 }))).toBe("growth");
    expect(computeSystemPhase(makePhaseInput({ global_stability_score: 74 }))).toBe("stable");
  });

  // ─── Precedence 5: stable ────────────────────────────────────────────
  it("returns stable as default", () => {
    expect(computeSystemPhase(makePhaseInput())).toBe("stable");
  });

  it("returns stable with moderate stress and no volatility", () => {
    expect(
      computeSystemPhase(
        makePhaseInput({ global_stability_score: 55 }),
      ),
    ).toBe("stable");
  });
});

describe("extractPhaseInputs", () => {
  it("extracts governance risk from state_json", () => {
    const result = extractPhaseInputs({
      overload_flag: false,
      global_stability_score: 60,
      dominant_risk_domain: "health",
      governance: {
        state_json: {
          governance_risk_score: 7,
          recovery_state: "relapse",
        },
      },
      health_volatility_flag: true,
      cognitive_volatility_flag: false,
      confidence_score: 50,
    });

    expect(result.governance_risk_score).toBe(7);
    expect(result.recovery_state).toBe("relapse");
    expect(result.volatility_flags.health_volatility).toBe(true);
    expect(result.volatility_flags.cognitive_volatility).toBe(false);
  });

  it("defaults to safe values when governance is null", () => {
    const result = extractPhaseInputs({
      overload_flag: false,
      global_stability_score: 70,
      dominant_risk_domain: "none",
      governance: null,
      health_volatility_flag: false,
      cognitive_volatility_flag: false,
      confidence_score: 80,
    });

    expect(result.governance_risk_score).toBe(0);
    expect(result.recovery_state).toBeNull();
  });
});
