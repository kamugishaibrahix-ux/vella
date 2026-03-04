import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  evaluateProposal,
  isSoftStartActive,
  getSoftStartProposalCount,
  incrementSoftStartProposalCount,
  SOFT_START_MAX_PROPOSALS,
  SOFT_START_KEY,
  SOFT_START_COUNT_KEY,
} from "@/lib/osSignals/proposalEngine";
import { writeFlag } from "@/lib/local/runtimeFlags";
import type { ProposalInput } from "@/lib/osSignals/proposalEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOMAIN = "self-mastery" as const;

function makeInput(signalSeverity: "low" | "moderate" | "high", minsAgo: number): ProposalInput {
  const created_at = new Date(Date.now() - minsAgo * 60 * 1000).toISOString();
  return {
    recentEntriesMeta: [
      {
        created_at,
        signals: [{ domain: DOMAIN, severity: signalSeverity, code: "SM_DISCIPLINE_LAPSE", confidence: 80, source: "journal" as const }],
      },
    ],
    selectedDomains: [DOMAIN],
  };
}

// ---------------------------------------------------------------------------
// Test 2: evaluateProposal does not crash when window is undefined (SSR)
// ---------------------------------------------------------------------------

describe("evaluateProposal — SSR safety (window undefined)", () => {
  let savedWindow: typeof globalThis.window;

  beforeEach(() => {
    savedWindow = globalThis.window;
    // @ts-expect-error — intentionally removing window to simulate SSR
    delete globalThis.window;
  });

  afterEach(() => {
    globalThis.window = savedWindow;
  });

  it("returns null for empty input without crashing", () => {
    expect(() =>
      evaluateProposal({ recentEntriesMeta: [], selectedDomains: [] })
    ).not.toThrow();
    expect(evaluateProposal({ recentEntriesMeta: [], selectedDomains: [] })).toBeNull();
  });

  it("does not crash and returns null for moderate signal (no soft-start in SSR)", () => {
    // In SSR: isSoftStartActive() returns false, soft-start rule doesn't fire.
    // 1 MODERATE in 24h without strict rules → no proposal.
    const input = makeInput("moderate", 60);
    expect(() => evaluateProposal(input)).not.toThrow();
    expect(evaluateProposal(input)).toBeNull();
  });

  it("does not crash and still fires HIGH_SEVERITY_RECENT in SSR (strict rule, no storage needed)", () => {
    const input = makeInput("high", 60);
    const result = evaluateProposal(input);
    expect(result).not.toBeNull();
    expect(result!.reasonCodes).toContain("HIGH_SEVERITY_RECENT");
  });
});

// ---------------------------------------------------------------------------
// Test 3: soft-start active vs expired toggles proposal threshold behaviour
// ---------------------------------------------------------------------------

describe("evaluateProposal — soft-start active vs expired", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does NOT generate SOFT_START_MODERATE when soft-start key is absent", () => {
    // No soft-start set → strict mode
    const input = makeInput("moderate", 60);
    const result = evaluateProposal(input);
    expect(result).toBeNull(); // 1 MODERATE in 24h not enough in strict mode
  });

  it("generates SOFT_START_MODERATE when soft-start window is active", () => {
    // Set soft-start to expire 7 days from now
    const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    writeFlag(SOFT_START_KEY, futureIso);

    const input = makeInput("moderate", 60);
    const result = evaluateProposal(input);
    expect(result).not.toBeNull();
    expect(result!.reasonCodes).toContain("SOFT_START_MODERATE");
    expect(result!.domain).toBe(DOMAIN);
  });

  it("does NOT generate SOFT_START_MODERATE when soft-start window has expired", () => {
    // Set soft-start to 1ms in the past
    const pastIso = new Date(Date.now() - 1).toISOString();
    writeFlag(SOFT_START_KEY, pastIso);

    const input = makeInput("moderate", 60);
    const result = evaluateProposal(input);
    expect(result).toBeNull(); // expired → strict mode → 1 MODERATE not enough
  });

  it("still fires HIGH_SEVERITY_RECENT when soft-start is expired (strict rule unaffected)", () => {
    const pastIso = new Date(Date.now() - 1).toISOString();
    writeFlag(SOFT_START_KEY, pastIso);

    const input = makeInput("high", 60);
    const result = evaluateProposal(input);
    expect(result).not.toBeNull();
    expect(result!.reasonCodes).toContain("HIGH_SEVERITY_RECENT");
  });

  it("isSoftStartActive returns true when within window", () => {
    const futureIso = new Date(Date.now() + 1000).toISOString();
    writeFlag(SOFT_START_KEY, futureIso);
    expect(isSoftStartActive()).toBe(true);
  });

  it("isSoftStartActive returns false when window expired", () => {
    const pastIso = new Date(Date.now() - 1000).toISOString();
    writeFlag(SOFT_START_KEY, pastIso);
    expect(isSoftStartActive()).toBe(false);
  });

  it("isSoftStartActive accepts an overridden now (for deterministic testing)", () => {
    const base = new Date("2030-01-10T00:00:00.000Z");
    const expires = new Date("2030-01-15T00:00:00.000Z").toISOString();
    writeFlag(SOFT_START_KEY, expires);

    // Before expiry
    expect(isSoftStartActive(new Date("2030-01-12T00:00:00.000Z").toISOString())).toBe(true);
    // After expiry
    expect(isSoftStartActive(new Date("2030-01-16T00:00:00.000Z").toISOString())).toBe(false);
  });

  it("enforces SOFT_START_MAX_PROPOSALS cap: returns null when cap reached", () => {
    const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    writeFlag(SOFT_START_KEY, futureIso);
    // Simulate cap already reached
    writeFlag(SOFT_START_COUNT_KEY, String(SOFT_START_MAX_PROPOSALS));

    const input = makeInput("moderate", 60);
    expect(evaluateProposal(input)).toBeNull();
  });

  it("getSoftStartProposalCount returns 0 when key absent", () => {
    expect(getSoftStartProposalCount()).toBe(0);
  });

  it("incrementSoftStartProposalCount increments correctly", () => {
    expect(getSoftStartProposalCount()).toBe(0);
    incrementSoftStartProposalCount();
    expect(getSoftStartProposalCount()).toBe(1);
    incrementSoftStartProposalCount();
    expect(getSoftStartProposalCount()).toBe(2);
  });

  it("SOFT_START_MODERATE only fires for signal domain that is in selectedDomains", () => {
    const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    writeFlag(SOFT_START_KEY, futureIso);

    // Signal for a domain NOT in selectedDomains
    const input: ProposalInput = {
      recentEntriesMeta: [
        {
          created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          signals: [{ domain: "addiction-recovery" as const, severity: "moderate", code: "AR_CRAVING_SPIKE", confidence: 70, source: "journal" as const }],
        },
      ],
      selectedDomains: [DOMAIN], // does NOT include addiction-recovery
    };
    expect(evaluateProposal(input)).toBeNull();
  });
});
