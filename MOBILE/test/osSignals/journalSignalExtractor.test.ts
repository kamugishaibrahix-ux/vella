/**
 * Tests for deterministic journal signal extractor.
 * Covers: domain mapping, severity thresholds, max signals cap, determinism.
 */

import { describe, it, expect } from "vitest";
import { extractSignalsFromJournalText } from "@/lib/osSignals/journalSignalExtractor";
import { SIGNAL_CODES, SIGNAL_SEVERITIES, OSSignalSchema, OSSignalsArraySchema } from "@/lib/osSignals/taxonomy";

// ---------------------------------------------------------------------------
// Domain mapping correctness
// ---------------------------------------------------------------------------

describe("domain mapping", () => {
  it("maps anxiety keywords to emotional-intelligence domain", () => {
    const signals = extractSignalsFromJournalText("I feel so anxious today, panic is setting in");
    const eiSignals = signals.filter((s) => s.domain === "emotional-intelligence");
    expect(eiSignals.length).toBeGreaterThanOrEqual(1);
    expect(eiSignals.some((s) => s.code === "EI_ANXIETY_ELEVATED")).toBe(true);
  });

  it("maps relapse keywords to addiction-recovery domain", () => {
    const signals = extractSignalsFromJournalText("I relapsed last night. I slipped and fell back into old patterns.");
    const arSignals = signals.filter((s) => s.domain === "addiction-recovery");
    expect(arSignals.length).toBeGreaterThanOrEqual(1);
    expect(arSignals.some((s) => s.code === "AR_RELAPSE_RISK")).toBe(true);
  });

  it("maps routine-break keywords to self-mastery domain", () => {
    const signals = extractSignalsFromJournalText("I skipped my routine again this morning");
    const smSignals = signals.filter((s) => s.domain === "self-mastery");
    expect(smSignals.length).toBeGreaterThanOrEqual(1);
    expect(smSignals.some((s) => s.code === "SM_ROUTINE_BREAK")).toBe(true);
  });

  it("maps conflict keywords to relationships domain", () => {
    const signals = extractSignalsFromJournalText("Had a huge argument with my partner, we ended up yelling");
    const reSignals = signals.filter((s) => s.domain === "relationships");
    expect(reSignals.length).toBeGreaterThanOrEqual(1);
    expect(reSignals.some((s) => s.code === "RE_CONFLICT_MENTION")).toBe(true);
  });

  it("maps sleep keywords to physical-health domain", () => {
    const signals = extractSignalsFromJournalText("I can't sleep, insomnia is getting worse");
    const phSignals = signals.filter((s) => s.domain === "physical-health");
    expect(phSignals.length).toBeGreaterThanOrEqual(1);
    expect(phSignals.some((s) => s.code === "PH_SLEEP_DISRUPTION")).toBe(true);
  });

  it("maps burnout keywords to performance-focus domain", () => {
    const signals = extractSignalsFromJournalText("Burnout is real. I'm burnt out from work.");
    const pfSignals = signals.filter((s) => s.domain === "performance-focus");
    expect(pfSignals.length).toBeGreaterThanOrEqual(1);
    expect(pfSignals.some((s) => s.code === "PF_BURNOUT_RISK")).toBe(true);
  });

  it("maps purpose-doubt keywords to identity-purpose domain", () => {
    const signals = extractSignalsFromJournalText("I have no purpose, what am I doing with my life");
    const ipSignals = signals.filter((s) => s.domain === "identity-purpose");
    expect(ipSignals.length).toBeGreaterThanOrEqual(1);
    expect(ipSignals.some((s) => s.code === "IP_PURPOSE_DOUBT")).toBe(true);
  });

  it("maps budget-breach keywords to financial-discipline domain", () => {
    const signals = extractSignalsFromJournalText("I overspent again and blew my budget");
    const fdSignals = signals.filter((s) => s.domain === "financial-discipline");
    expect(fdSignals.length).toBeGreaterThanOrEqual(1);
    expect(fdSignals.some((s) => s.code === "FD_BUDGET_BREACH")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Severity thresholds
// ---------------------------------------------------------------------------

describe("severity thresholds", () => {
  it("returns low severity for a single low-base match", () => {
    const signals = extractSignalsFromJournalText("I skipped my routine this morning");
    const routine = signals.find((s) => s.code === "SM_ROUTINE_BREAK");
    expect(routine).toBeDefined();
    expect(routine!.severity).toBe("low");
  });

  it("escalates severity with repeated keyword mentions", () => {
    const signals = extractSignalsFromJournalText(
      "I feel anxious, so anxious, the anxiety won't stop and I'm worried about everything"
    );
    const anxiety = signals.find((s) => s.code === "EI_ANXIETY_ELEVATED");
    expect(anxiety).toBeDefined();
    // With multiple matches, severity should escalate from moderate base
    expect(["moderate", "high"]).toContain(anxiety!.severity);
  });

  it("gives high severity for inherently high-severity codes like relapse", () => {
    const signals = extractSignalsFromJournalText("I relapsed yesterday");
    const relapse = signals.find((s) => s.code === "AR_RELAPSE_RISK");
    expect(relapse).toBeDefined();
    expect(relapse!.severity).toBe("high");
  });

  it("increases confidence with more match hits", () => {
    const singleMatch = extractSignalsFromJournalText("I feel stressed");
    const multiMatch = extractSignalsFromJournalText("I feel stressed, the pressure is too much, I'm overloaded and stressed");
    const singleSignal = singleMatch.find((s) => s.code === "EI_STRESS_OVERLOAD");
    const multiSignal = multiMatch.find((s) => s.code === "EI_STRESS_OVERLOAD");
    expect(singleSignal).toBeDefined();
    expect(multiSignal).toBeDefined();
    expect(multiSignal!.confidence).toBeGreaterThan(singleSignal!.confidence);
  });
});

// ---------------------------------------------------------------------------
// Max signals cap
// ---------------------------------------------------------------------------

describe("max signals cap", () => {
  it("never returns more than 8 signals", () => {
    // Text touching many domains at once
    const text = `
      I'm so anxious and overwhelmed. My mood keeps swinging.
      I had an argument with my partner. I feel lonely.
      I can't sleep. No energy. I'm exhausted from work.
      I relapsed. My cravings are intense. I gave in to impulse.
      I skipped my routine. I'm scrolling too much on social media.
      I overspent. Blew my budget. No purpose in life. Meaningless.
      I'm procrastinating. Can't focus. Burnout is real.
    `;
    const signals = extractSignalsFromJournalText(text);
    expect(signals.length).toBeLessThanOrEqual(8);
  });

  it("prioritizes higher severity signals when capping", () => {
    const text = `
      I relapsed and I'm furious. I feel overwhelmed and can't cope.
      My savings are gone. Trust is broken. I'm burnt out. No purpose.
      I can't sleep. Skipped my routine. I'm scrolling too much.
      I skipped the gym again. I'm procrastinating at work. I'm distracted.
    `;
    const signals = extractSignalsFromJournalText(text);
    expect(signals.length).toBeLessThanOrEqual(8);
    // First signal should be high severity
    if (signals.length > 0) {
      expect(signals[0].severity).toBe("high");
    }
  });
});

// ---------------------------------------------------------------------------
// Determinism (same input → same output)
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("produces identical output for identical input", () => {
    const text = "I feel anxious and stressed. I had an argument and can't sleep.";
    const run1 = extractSignalsFromJournalText(text);
    const run2 = extractSignalsFromJournalText(text);
    const run3 = extractSignalsFromJournalText(text);
    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });

  it("produces identical output over 100 iterations", () => {
    const text = "I'm overwhelmed, my cravings are intense, and I broke my routine again.";
    const baseline = extractSignalsFromJournalText(text);
    for (let i = 0; i < 100; i++) {
      expect(extractSignalsFromJournalText(text)).toEqual(baseline);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("returns empty array for empty string", () => {
    expect(extractSignalsFromJournalText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(extractSignalsFromJournalText("   \n\t  ")).toEqual([]);
  });

  it("returns empty array for text with no matching keywords", () => {
    expect(extractSignalsFromJournalText("Today I went to the park and had a nice walk.")).toEqual([]);
  });

  it("all returned signals pass Zod schema validation", () => {
    const text = "I feel anxious and overwhelmed. I relapsed. My savings are gone. Can't sleep.";
    const signals = extractSignalsFromJournalText(text);
    expect(signals.length).toBeGreaterThan(0);

    // Validate each signal individually
    for (const signal of signals) {
      const result = OSSignalSchema.safeParse(signal);
      expect(result.success).toBe(true);
    }

    // Validate as array
    const arrayResult = OSSignalsArraySchema.safeParse(signals);
    expect(arrayResult.success).toBe(true);
  });

  it("all signal codes are from the allowed enum", () => {
    const text = "I'm anxious, stressed, can't sleep, procrastinating, overspent, and my cravings are intense.";
    const signals = extractSignalsFromJournalText(text);
    for (const signal of signals) {
      expect(SIGNAL_CODES).toContain(signal.code);
    }
  });

  it("all severities are from the allowed enum", () => {
    const text = "I relapsed, I'm furious, overwhelmed, and broke my budget.";
    const signals = extractSignalsFromJournalText(text);
    for (const signal of signals) {
      expect(SIGNAL_SEVERITIES).toContain(signal.severity);
    }
  });

  it("all confidences are bounded 0–100", () => {
    const text = "Anxious anxious anxious anxious stressed stressed stressed stressed panic panic panic.";
    const signals = extractSignalsFromJournalText(text);
    for (const signal of signals) {
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
    }
  });

  it("source is always 'journal'", () => {
    const signals = extractSignalsFromJournalText("I feel so anxious and stressed out");
    for (const signal of signals) {
      expect(signal.source).toBe("journal");
    }
  });
});
