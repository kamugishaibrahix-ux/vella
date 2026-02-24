/**
 * Hybrid Coupling v1: modeResolver pure function tests.
 */
import { describe, it, expect } from "vitest";
import { resolveMode } from "@/lib/ai/modeResolver";
import type { VellaMode } from "@/lib/ai/modes";

describe("resolveMode", () => {
  it("forces crisis when escalationLevel >= 2", () => {
    expect(resolveMode("listen", { riskScore: 0, escalationLevel: 2 })).toBe("crisis");
    expect(resolveMode("challenge", { riskScore: 3, escalationLevel: 2 })).toBe("crisis");
    expect(resolveMode("vent", { riskScore: 10, escalationLevel: 3 })).toBe("crisis");
  });

  it("downgrades challenge to coach when riskScore >= 6", () => {
    expect(resolveMode("challenge", { riskScore: 6, escalationLevel: 0 })).toBe("coach");
    expect(resolveMode("challenge", { riskScore: 6, escalationLevel: 1 })).toBe("coach");
    expect(resolveMode("challenge", { riskScore: 10, escalationLevel: 0 })).toBe("coach");
  });

  it("allows challenge when riskScore < 6", () => {
    expect(resolveMode("challenge", { riskScore: 5, escalationLevel: 0 })).toBe("challenge");
    expect(resolveMode("challenge", { riskScore: 0, escalationLevel: 0 })).toBe("challenge");
  });

  it("defaults to listen when no requestedMode", () => {
    expect(resolveMode(null, { riskScore: 0, escalationLevel: 0 })).toBe("listen");
    expect(resolveMode(null, { riskScore: 5, escalationLevel: 1 })).toBe("listen");
  });

  it("returns requested mode when allowed", () => {
    const gov = { riskScore: 0, escalationLevel: 0 };
    expect(resolveMode("vent", gov)).toBe("vent");
    expect(resolveMode("listen", gov)).toBe("listen");
    expect(resolveMode("coach", gov)).toBe("coach");
    expect(resolveMode("crisis", gov)).toBe("crisis");
  });

  it("escalation takes precedence over challenge downgrade", () => {
    expect(resolveMode("challenge", { riskScore: 8, escalationLevel: 2 })).toBe("crisis");
  });

  describe("Phase 2: contradiction forces challenge", () => {
    it("contradiction + listen → challenge when escalationLevel < 2", () => {
      expect(resolveMode("listen", { riskScore: 0, escalationLevel: 0 }, { contradictionDetected: true })).toBe(
        "challenge"
      );
      expect(resolveMode("listen", { riskScore: 5, escalationLevel: 1 }, { contradictionDetected: true })).toBe(
        "challenge"
      );
    });

    it("contradiction + null requestedMode → challenge when escalationLevel < 2", () => {
      expect(resolveMode(null, { riskScore: 0, escalationLevel: 0 }, { contradictionDetected: true })).toBe(
        "challenge"
      );
    });

    it("contradiction does not override crisis: escalationLevel >= 2 still forces crisis", () => {
      expect(resolveMode("listen", { riskScore: 0, escalationLevel: 2 }, { contradictionDetected: true })).toBe(
        "crisis"
      );
      expect(resolveMode(null, { riskScore: 0, escalationLevel: 2 }, { contradictionDetected: true })).toBe("crisis");
    });

    it("no contradiction leaves listen as listen", () => {
      expect(resolveMode("listen", { riskScore: 0, escalationLevel: 0 }, { contradictionDetected: false })).toBe(
        "listen"
      );
      expect(resolveMode("listen", { riskScore: 0, escalationLevel: 0 })).toBe("listen");
    });
  });

  describe("Phase 3: boundary severity", () => {
    it("crisis always wins over boundarySeverity 2", () => {
      expect(
        resolveMode("listen", { riskScore: 0, escalationLevel: 2 }, { boundarySeverity: 2 })
      ).toBe("crisis");
      expect(
        resolveMode("vent", { riskScore: 0, escalationLevel: 2 }, { boundarySeverity: 2 })
      ).toBe("crisis");
    });

    it("boundarySeverity 2 forces coach when escalationLevel < 2", () => {
      expect(
        resolveMode("vent", { riskScore: 0, escalationLevel: 0 }, { boundarySeverity: 2 })
      ).toBe("coach");
      expect(
        resolveMode("listen", { riskScore: 0, escalationLevel: 0 }, { boundarySeverity: 2 })
      ).toBe("coach");
      expect(
        resolveMode("challenge", { riskScore: 0, escalationLevel: 0 }, { boundarySeverity: 2 })
      ).toBe("coach");
    });

    it("boundarySeverity 1 pushes vent into challenge", () => {
      expect(
        resolveMode("vent", { riskScore: 0, escalationLevel: 0 }, { boundarySeverity: 1 })
      ).toBe("challenge");
    });

    it("boundarySeverity 1 pushes listen into challenge", () => {
      expect(
        resolveMode("listen", { riskScore: 0, escalationLevel: 0 }, { boundarySeverity: 1 })
      ).toBe("challenge");
    });

    it("contradiction rule still works", () => {
      expect(
        resolveMode(null, { riskScore: 0, escalationLevel: 0 }, { contradictionDetected: true })
      ).toBe("challenge");
    });

    it("risk downgrade still works", () => {
      expect(resolveMode("challenge", { riskScore: 6, escalationLevel: 0 })).toBe("coach");
      expect(resolveMode("challenge", { riskScore: 10, escalationLevel: 0 })).toBe("coach");
    });

    it("Phase 4: firmnessLevel 4 with vent/listen and escalation < 2 → coach", () => {
      expect(
        resolveMode("vent", { riskScore: 0, escalationLevel: 0 }, { firmnessLevel: 4 })
      ).toBe("coach");
      expect(
        resolveMode("listen", { riskScore: 0, escalationLevel: 1 }, { firmnessLevel: 4 })
      ).toBe("coach");
    });

    it("Phase 4: crisis still wins over firmnessLevel 4", () => {
      expect(
        resolveMode("listen", { riskScore: 0, escalationLevel: 2 }, { firmnessLevel: 4 })
      ).toBe("crisis");
    });
  });
});
