/**
 * Tests for the deterministic proposal decision tree engine.
 * Covers: trigger rules, domain filtering, severity mapping,
 * duration/budget bounds, determinism, edge cases.
 */

import { describe, it, expect } from "vitest";
import { evaluateProposal, PROPOSAL_REASON_CODES } from "@/lib/osSignals/proposalEngine";
import type { ProposalInput } from "@/lib/osSignals/proposalEngine";
import type { OSSignal } from "@/lib/osSignals/taxonomy";

const NOW = "2026-02-27T12:00:00.000Z";
const NOW_MS = new Date(NOW).getTime();

function makeSignal(overrides: Partial<OSSignal> = {}): OSSignal {
  return {
    domain: "emotional-intelligence",
    code: "EI_ANXIETY_ELEVATED",
    severity: "moderate",
    confidence: 60,
    source: "journal",
    ...overrides,
  };
}

function hoursAgo(h: number): string {
  return new Date(NOW_MS - h * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Trigger: HIGH severity in last 24h
// ---------------------------------------------------------------------------

describe("HIGH severity in last 24h triggers proposal", () => {
  it("triggers proposal for a single HIGH signal within 24h", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(2), signals: [makeSignal({ severity: "high" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).not.toBeNull();
    expect(result!.domain).toBe("emotional-intelligence");
    expect(result!.reasonCodes).toContain("HIGH_SEVERITY_RECENT");
  });

  it("does NOT trigger for HIGH signal older than 24h (but within 72h)", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(30), signals: [makeSignal({ severity: "high" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    // HIGH outside 24h doesn't trigger HIGH_SEVERITY_RECENT,
    // but it counts as one moderate+ signal — not enough for MODERATE_CLUSTER_72H (needs 2+)
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Trigger: 2+ MODERATE in same domain within 72h
// ---------------------------------------------------------------------------

describe("2+ MODERATE in same domain within 72h triggers proposal", () => {
  it("triggers when 2 moderate signals exist in the same domain within 72h", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(48), signals: [makeSignal({ severity: "moderate" })] },
        { created_at: hoursAgo(12), signals: [makeSignal({ severity: "moderate" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).not.toBeNull();
    expect(result!.reasonCodes).toContain("MODERATE_CLUSTER_72H");
  });

  it("does NOT trigger for only 1 moderate signal in 72h", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(12), signals: [makeSignal({ severity: "moderate" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).toBeNull();
  });

  it("does NOT trigger for 2 moderate signals in DIFFERENT domains", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(12), signals: [makeSignal({ domain: "emotional-intelligence", severity: "moderate" })] },
        { created_at: hoursAgo(24), signals: [makeSignal({ domain: "physical-health", code: "PH_SLEEP_DISRUPTION", severity: "moderate" })] },
      ],
      selectedDomains: ["emotional-intelligence", "physical-health"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Domain filtering: only selectedDomains considered
// ---------------------------------------------------------------------------

describe("domain filtering", () => {
  it("ignores signals from domains not in selectedDomains", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ domain: "financial-discipline", code: "FD_IMPULSE_SPEND", severity: "high" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).toBeNull();
  });

  it("returns null when selectedDomains is empty", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "high" })] },
      ],
      selectedDomains: [],
    };
    expect(evaluateProposal(input, NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Severity → duration and budget mapping
// ---------------------------------------------------------------------------

describe("severity mapping to duration and budget", () => {
  it("HIGH severity → 7 days, budget 5", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "high" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).not.toBeNull();
    expect(result!.recommendedDurationDays).toBe(7);
    expect(result!.budgetWeight).toBe(5);
  });

  it("MODERATE cluster → 5 days, budget 3", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(10), signals: [makeSignal({ severity: "moderate" })] },
        { created_at: hoursAgo(30), signals: [makeSignal({ severity: "moderate" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).not.toBeNull();
    expect(result!.recommendedDurationDays).toBe(5);
    expect(result!.budgetWeight).toBe(3);
  });

  it("duration is always between 3 and 7", () => {
    // Test with high
    const highInput: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "high" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const highResult = evaluateProposal(highInput, NOW);
    expect(highResult!.recommendedDurationDays).toBeGreaterThanOrEqual(3);
    expect(highResult!.recommendedDurationDays).toBeLessThanOrEqual(7);

    // Test with moderate cluster
    const modInput: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(10), signals: [makeSignal({ severity: "moderate" })] },
        { created_at: hoursAgo(20), signals: [makeSignal({ severity: "moderate" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const modResult = evaluateProposal(modInput, NOW);
    expect(modResult!.recommendedDurationDays).toBeGreaterThanOrEqual(3);
    expect(modResult!.recommendedDurationDays).toBeLessThanOrEqual(7);
  });

  it("budgetWeight is always between 1 and 5", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "high" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result!.budgetWeight).toBeGreaterThanOrEqual(1);
    expect(result!.budgetWeight).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Reason codes are valid enums
// ---------------------------------------------------------------------------

describe("reason codes", () => {
  it("all reason codes are from PROPOSAL_REASON_CODES", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "high" })] },
        { created_at: hoursAgo(10), signals: [makeSignal({ severity: "moderate" })] },
        { created_at: hoursAgo(20), signals: [makeSignal({ severity: "moderate" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).not.toBeNull();
    for (const code of result!.reasonCodes) {
      expect(PROPOSAL_REASON_CODES).toContain(code);
    }
  });

  it("can have both HIGH_SEVERITY_RECENT and MODERATE_CLUSTER_72H", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "high" })] },
        { created_at: hoursAgo(48), signals: [makeSignal({ severity: "moderate" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result).not.toBeNull();
    expect(result!.reasonCodes).toContain("HIGH_SEVERITY_RECENT");
    expect(result!.reasonCodes).toContain("MODERATE_CLUSTER_72H");
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same input produces same output every time", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "high" })] },
        { created_at: hoursAgo(48), signals: [makeSignal({ severity: "moderate" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const baseline = evaluateProposal(input, NOW);
    for (let i = 0; i < 50; i++) {
      expect(evaluateProposal(input, NOW)).toEqual(baseline);
    }
  });

  it("picks highest-severity domain deterministically on tie", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [
          makeSignal({ domain: "emotional-intelligence", severity: "high" }),
          makeSignal({ domain: "physical-health", code: "PH_FATIGUE_CHRONIC", severity: "high" }),
        ]},
      ],
      selectedDomains: ["emotional-intelligence", "physical-health"],
    };
    const r1 = evaluateProposal(input, NOW);
    const r2 = evaluateProposal(input, NOW);
    expect(r1).toEqual(r2);
    // Alphabetical tie-break: emotional-intelligence < physical-health
    expect(r1!.domain).toBe("emotional-intelligence");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("returns null for empty entries", () => {
    expect(evaluateProposal({ recentEntriesMeta: [], selectedDomains: ["emotional-intelligence"] }, NOW)).toBeNull();
  });

  it("returns null when all entries are older than 72h", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(100), signals: [makeSignal({ severity: "high" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    expect(evaluateProposal(input, NOW)).toBeNull();
  });

  it("returns null for only LOW severity signals", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "low" })] },
        { created_at: hoursAgo(2), signals: [makeSignal({ severity: "low" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    expect(evaluateProposal(input, NOW)).toBeNull();
  });

  it("proposal has a non-empty id and created_at", () => {
    const input: ProposalInput = {
      recentEntriesMeta: [
        { created_at: hoursAgo(1), signals: [makeSignal({ severity: "high" })] },
      ],
      selectedDomains: ["emotional-intelligence"],
    };
    const result = evaluateProposal(input, NOW);
    expect(result!.id).toBeTruthy();
    expect(result!.id.length).toBeGreaterThan(0);
    expect(result!.created_at).toBe(NOW);
  });
});
