import { describe, it, expect } from "vitest";
import { computeStateLabel, type StateLabelInput } from "@/lib/home/stateLabel";

// ---------------------------------------------------------------------------
// Helper: default input with all zeros / neutral
// ---------------------------------------------------------------------------

function base(overrides: Partial<StateLabelInput> = {}): StateLabelInput {
  return {
    consistency: 0,
    stability: 0.6,
    improvement: 0.5,
    missedWindows: 0,
    unreadInbox: 0,
    activeCommitments: 0,
    triggersUsed: 0,
    triggersCap: 5,
    streakDays: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Label derivation
// ---------------------------------------------------------------------------

describe("computeStateLabel — label", () => {
  it("returns Starting when no commitments, no streak, no consistency", () => {
    const result = computeStateLabel(base());
    expect(result.label).toBe("Starting");
  });

  it("returns Under Load when missedWindows >= 2", () => {
    const result = computeStateLabel(base({ missedWindows: 3, activeCommitments: 2, consistency: 0.5, stability: 0.5 }));
    expect(result.label).toBe("Under Load");
  });

  it("returns Drifting when low stability + low consistency", () => {
    const result = computeStateLabel(base({ stability: 0.2, consistency: 0.1, activeCommitments: 1 }));
    expect(result.label).toBe("Drifting");
  });

  it("returns Rebuilding when consistency low but improvement high", () => {
    const result = computeStateLabel(base({ consistency: 0.3, improvement: 0.7, stability: 0.5, activeCommitments: 1 }));
    expect(result.label).toBe("Rebuilding");
  });

  it("returns Stable when stability >= 0.5 and consistency >= 0.4", () => {
    const result = computeStateLabel(base({ stability: 0.6, consistency: 0.5, activeCommitments: 2 }));
    expect(result.label).toBe("Stable");
  });

  it("returns Building as default when above Starting but not Stable", () => {
    const result = computeStateLabel(base({ stability: 0.45, consistency: 0.35, activeCommitments: 1 }));
    expect(result.label).toBe("Building");
  });
});

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

describe("computeStateLabel — chips", () => {
  it("always returns exactly 3 chips", () => {
    const result = computeStateLabel(base({ activeCommitments: 1, consistency: 0.5, stability: 0.6 }));
    expect(result.chips).toHaveLength(3);
  });

  it("returns Consistency chip with days / 7 format", () => {
    const result = computeStateLabel(base({ consistency: 0.71, activeCommitments: 1 }));
    const chip = result.chips.find((c) => c.label === "Consistency");
    expect(chip).toBeDefined();
    expect(chip!.value).toBe("5/7");
  });

  it("returns Focus chip derived from stability", () => {
    const high = computeStateLabel(base({ stability: 0.7, activeCommitments: 1 }));
    expect(high.chips.find((c) => c.label === "Focus")!.value).toBe("High");

    const ok = computeStateLabel(base({ stability: 0.4, activeCommitments: 1 }));
    expect(ok.chips.find((c) => c.label === "Focus")!.value).toBe("OK");

    const low = computeStateLabel(base({ stability: 0.2, activeCommitments: 1 }));
    expect(low.chips.find((c) => c.label === "Focus")!.value).toBe("Low");
  });

  it("returns Risk chip based on missedWindows and stability", () => {
    const highRisk = computeStateLabel(base({ missedWindows: 2, activeCommitments: 1 }));
    expect(highRisk.chips.find((c) => c.label === "Risk")!.value).toBe("High");

    const medRisk = computeStateLabel(base({ missedWindows: 1, stability: 0.5, activeCommitments: 1 }));
    expect(medRisk.chips.find((c) => c.label === "Risk")!.value).toBe("Med");

    const lowRisk = computeStateLabel(base({ missedWindows: 0, stability: 0.5, activeCommitments: 1 }));
    expect(lowRisk.chips.find((c) => c.label === "Risk")!.value).toBe("Low");
  });
});

// ---------------------------------------------------------------------------
// Suggestion
// ---------------------------------------------------------------------------

describe("computeStateLabel — suggestion", () => {
  it("prioritises unread inbox items", () => {
    const result = computeStateLabel(base({ unreadInbox: 3, activeCommitments: 1 }));
    expect(result.suggestion).toContain("3 unread items");
  });

  it("suggests reviewing missed windows when inbox is empty but missed > 0", () => {
    const result = computeStateLabel(base({ missedWindows: 1, activeCommitments: 1 }));
    expect(result.suggestion).toContain("missed windows");
  });

  it("returns Starting suggestion when idle", () => {
    const result = computeStateLabel(base());
    expect(result.suggestion).toBe("Set a direction to get started.");
  });

  it("returns stable suggestion when stable", () => {
    const result = computeStateLabel(base({ stability: 0.6, consistency: 0.5, activeCommitments: 2 }));
    expect(result.suggestion).toBe("All clear. Stay the course.");
  });

  it("returns daily limit suggestion when triggers maxed and Building", () => {
    const result = computeStateLabel(base({ triggersUsed: 5, triggersCap: 5, stability: 0.45, consistency: 0.35, activeCommitments: 1 }));
    expect(result.suggestion).toContain("Daily limit reached");
  });
});
