/**
 * Cognitive Performance Engine — Unit Tests
 * Tests deterministic computation functions only (no Supabase).
 */

import { describe, it, expect } from "vitest";
import {
  computeRegretIndex,
  computeConfidenceDrift,
  computeDecisionVolatility,
  computeBiasFrequency,
  evaluateCognitiveGovernanceSignal,
  COGNITIVE_GOVERNANCE_WEIGHT,
} from "@/lib/cognitive/cognitiveEngine";
import type { CognitiveStateOutput } from "@/lib/cognitive/cognitiveEngine";

describe("computeRegretIndex", () => {
  it("returns 0 for empty outcomes", () => {
    expect(computeRegretIndex([])).toBe(0);
  });

  it("returns 0 for minimum regret scores (all 1s)", () => {
    const outcomes = [
      { regret_score: 1 }, { regret_score: 1 }, { regret_score: 1 },
    ];
    expect(computeRegretIndex(outcomes)).toBe(0);
  });

  it("returns 100 for maximum regret scores (all 10s)", () => {
    const outcomes = [
      { regret_score: 10 }, { regret_score: 10 }, { regret_score: 10 },
    ];
    expect(computeRegretIndex(outcomes)).toBe(100);
  });

  it("returns mid-range for average regret", () => {
    const outcomes = [
      { regret_score: 5 }, { regret_score: 5 }, { regret_score: 5 },
    ];
    const index = computeRegretIndex(outcomes);
    expect(index).toBeGreaterThan(30);
    expect(index).toBeLessThan(60);
  });

  it("handles single outcome", () => {
    expect(computeRegretIndex([{ regret_score: 7 }])).toBeGreaterThan(50);
  });

  it("is deterministic", () => {
    const outcomes = [
      { regret_score: 3 }, { regret_score: 7 }, { regret_score: 5 },
    ];
    expect(computeRegretIndex(outcomes)).toBe(computeRegretIndex(outcomes));
  });
});

describe("computeConfidenceDrift", () => {
  it("returns 0 for fewer than 2 decisions", () => {
    expect(computeConfidenceDrift([])).toBe(0);
    expect(computeConfidenceDrift([{ confidence_score: 5 }])).toBe(0);
  });

  it("returns 0 for identical confidence scores", () => {
    const decisions = [
      { confidence_score: 5 }, { confidence_score: 5 }, { confidence_score: 5 },
    ];
    expect(computeConfidenceDrift(decisions)).toBe(0);
  });

  it("returns high drift for wildly varying scores", () => {
    const decisions = [
      { confidence_score: 1 }, { confidence_score: 10 },
      { confidence_score: 1 }, { confidence_score: 10 },
    ];
    expect(computeConfidenceDrift(decisions)).toBeGreaterThan(80);
  });

  it("returns moderate drift for moderate variation", () => {
    const decisions = [
      { confidence_score: 4 }, { confidence_score: 6 },
      { confidence_score: 5 }, { confidence_score: 7 },
    ];
    const drift = computeConfidenceDrift(decisions);
    expect(drift).toBeGreaterThan(10);
    expect(drift).toBeLessThan(50);
  });
});

describe("computeDecisionVolatility", () => {
  it("returns 0 for fewer than 2 decisions", () => {
    expect(computeDecisionVolatility([])).toBe(0);
    expect(computeDecisionVolatility([
      { confidence_score: 5, recorded_at: "2026-01-01T00:00:00Z" },
    ])).toBe(0);
  });

  it("returns 0 for stable decisions (all swings <=3)", () => {
    const decisions = [
      { confidence_score: 5, recorded_at: "2026-01-01T00:00:00Z" },
      { confidence_score: 6, recorded_at: "2026-01-02T00:00:00Z" },
      { confidence_score: 7, recorded_at: "2026-01-03T00:00:00Z" },
    ];
    expect(computeDecisionVolatility(decisions)).toBe(0);
  });

  it("returns 100 for all-volatile decisions (all swings >3)", () => {
    const decisions = [
      { confidence_score: 1, recorded_at: "2026-01-01T00:00:00Z" },
      { confidence_score: 9, recorded_at: "2026-01-02T00:00:00Z" },
      { confidence_score: 2, recorded_at: "2026-01-03T00:00:00Z" },
    ];
    expect(computeDecisionVolatility(decisions)).toBe(100);
  });

  it("returns 50 for half-volatile decisions", () => {
    const decisions = [
      { confidence_score: 5, recorded_at: "2026-01-01T00:00:00Z" },
      { confidence_score: 9, recorded_at: "2026-01-02T00:00:00Z" },
      { confidence_score: 8, recorded_at: "2026-01-03T00:00:00Z" },
    ];
    expect(computeDecisionVolatility(decisions)).toBe(50);
  });

  it("sorts by recorded_at before computing", () => {
    const decisions = [
      { confidence_score: 10, recorded_at: "2026-01-03T00:00:00Z" },
      { confidence_score: 5, recorded_at: "2026-01-01T00:00:00Z" },
      { confidence_score: 6, recorded_at: "2026-01-02T00:00:00Z" },
    ];
    const vol = computeDecisionVolatility(decisions);
    expect(vol).toBe(50);
  });
});

describe("computeBiasFrequency", () => {
  it("returns 0 for empty input", () => {
    expect(computeBiasFrequency([], [], [])).toBe(0);
  });

  it("detects emotional bias: high intensity + low confidence", () => {
    const decisions = [
      { confidence_score: 3, emotional_intensity: 8 },
      { confidence_score: 2, emotional_intensity: 9 },
    ];
    const score = computeBiasFrequency(decisions, [], ["d1", "d2"]);
    expect(score).toBe(100);
  });

  it("detects overconfidence bias: high confidence + high regret", () => {
    const decisions = [
      { confidence_score: 9, emotional_intensity: 3 },
    ];
    const outcomes = [
      { decision_id: "d1", regret_score: 8 },
    ];
    const score = computeBiasFrequency(decisions, outcomes, ["d1"]);
    expect(score).toBe(100);
  });

  it("returns 0 when no bias patterns detected", () => {
    const decisions = [
      { confidence_score: 6, emotional_intensity: 4 },
      { confidence_score: 7, emotional_intensity: 3 },
    ];
    const outcomes = [
      { decision_id: "d1", regret_score: 2 },
      { decision_id: "d2", regret_score: 3 },
    ];
    const score = computeBiasFrequency(decisions, outcomes, ["d1", "d2"]);
    expect(score).toBe(0);
  });

  it("returns partial score for mixed decisions", () => {
    const decisions = [
      { confidence_score: 3, emotional_intensity: 8 },
      { confidence_score: 7, emotional_intensity: 3 },
      { confidence_score: 6, emotional_intensity: 4 },
    ];
    const score = computeBiasFrequency(decisions, [], ["d1", "d2", "d3"]);
    expect(score).toBe(33);
  });
});

describe("evaluateCognitiveGovernanceSignal", () => {
  it("returns null when below thresholds", () => {
    const state: CognitiveStateOutput = {
      avg_confidence: 7,
      regret_index: 30,
      bias_frequency_score: 20,
      decision_volatility: 25,
    };
    expect(evaluateCognitiveGovernanceSignal(state)).toBeNull();
  });

  it("fires when regret_index exceeds threshold", () => {
    const state: CognitiveStateOutput = {
      avg_confidence: 5,
      regret_index: COGNITIVE_GOVERNANCE_WEIGHT.regret_threshold + 1,
      bias_frequency_score: 20,
      decision_volatility: 20,
    };
    const signal = evaluateCognitiveGovernanceSignal(state);
    expect(signal).not.toBeNull();
    expect(signal!.checkin_frequency_flag).toBe(true);
    expect(signal!.domain_flag).toBe("cognitive_instability");
  });

  it("fires when decision_volatility exceeds threshold", () => {
    const state: CognitiveStateOutput = {
      avg_confidence: 5,
      regret_index: 20,
      bias_frequency_score: 20,
      decision_volatility: COGNITIVE_GOVERNANCE_WEIGHT.volatility_threshold + 1,
    };
    const signal = evaluateCognitiveGovernanceSignal(state);
    expect(signal).not.toBeNull();
    expect(signal!.risk_increment).toBe(COGNITIVE_GOVERNANCE_WEIGHT.risk_increment);
  });

  it("returns null at exactly the threshold", () => {
    const state: CognitiveStateOutput = {
      avg_confidence: 5,
      regret_index: COGNITIVE_GOVERNANCE_WEIGHT.regret_threshold,
      bias_frequency_score: 20,
      decision_volatility: COGNITIVE_GOVERNANCE_WEIGHT.volatility_threshold,
    };
    expect(evaluateCognitiveGovernanceSignal(state)).toBeNull();
  });
});
