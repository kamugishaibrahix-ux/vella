/**
 * Governance readState: staleness and defaults.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isGovernanceStale, GOVERNANCE_STATE_TTL_MS } from "@/lib/governance/readState";

describe("isGovernanceStale", () => {
  it("returns true when lastComputedAtIso is null", () => {
    expect(
      isGovernanceStale({
        riskScore: 0,
        escalationLevel: 0,
        recoveryState: "na",
        disciplineState: "na",
        focusState: "na",
        lastComputedAtIso: null,
      })
    ).toBe(true);
  });

  it("returns true when lastComputedAtIso is older than TTL", () => {
    const oldIso = new Date(Date.now() - GOVERNANCE_STATE_TTL_MS - 60_000).toISOString();
    expect(
      isGovernanceStale({
        riskScore: 0,
        escalationLevel: 0,
        recoveryState: "na",
        disciplineState: "na",
        focusState: "na",
        lastComputedAtIso: oldIso,
      })
    ).toBe(true);
  });

  it("returns false when lastComputedAtIso is within TTL", () => {
    const recentIso = new Date(Date.now() - 1000).toISOString();
    expect(
      isGovernanceStale({
        riskScore: 0,
        escalationLevel: 0,
        recoveryState: "na",
        disciplineState: "na",
        focusState: "na",
        lastComputedAtIso: recentIso,
      })
    ).toBe(false);
  });
});
