/**
 * Confidence Scoring + Outlier Damping — Unit Tests
 * Tests shared primitives used by all domain engines.
 */

import { describe, it, expect } from "vitest";
import {
  computeConfidenceScore,
  computeFreshness,
  computeFullConfidence,
  dampValue,
  dampHealthMetric,
  isHealthMetricSuspicious,
  isDecisionSuspicious,
  HEALTH_CONFIDENCE,
  FINANCIAL_CONFIDENCE,
  COGNITIVE_CONFIDENCE,
} from "@/lib/system/confidenceScoring";

// ─── computeConfidenceScore ──────────────────────────────────────────────────

describe("computeConfidenceScore", () => {
  it("returns 0 when sample_size below minimum", () => {
    expect(computeConfidenceScore({
      sampleSize: 2,
      freshnessHours: 1,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    })).toBe(0);
  });

  it("returns 0 when freshness exceeds max", () => {
    expect(computeConfidenceScore({
      sampleSize: 10,
      freshnessHours: 200,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    })).toBe(0);
  });

  it("returns 0 when both below minimum and stale", () => {
    expect(computeConfidenceScore({
      sampleSize: 1,
      freshnessHours: 300,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    })).toBe(0);
  });

  it("returns 100 for ideal sample size and fresh data", () => {
    expect(computeConfidenceScore({
      sampleSize: 7,
      freshnessHours: 0,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    })).toBe(100);
  });

  it("scales linearly with sample coverage", () => {
    const half = computeConfidenceScore({
      sampleSize: 4,
      freshnessHours: 0,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    });
    const full = computeConfidenceScore({
      sampleSize: 7,
      freshnessHours: 0,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    });
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(0);
  });

  it("decays with age", () => {
    const fresh = computeConfidenceScore({
      sampleSize: 7,
      freshnessHours: 10,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    });
    const stale = computeConfidenceScore({
      sampleSize: 7,
      freshnessHours: 150,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    });
    expect(fresh).toBeGreaterThan(stale);
  });

  it("is bounded 0–100", () => {
    const score = computeConfidenceScore({
      sampleSize: 100,
      freshnessHours: 0,
      minSampleSize: 1,
      idealSampleSize: 5,
      maxFreshnessHours: 168,
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic", () => {
    const input = {
      sampleSize: 5,
      freshnessHours: 24,
      minSampleSize: 3,
      idealSampleSize: 7,
      maxFreshnessHours: 168,
    };
    expect(computeConfidenceScore(input)).toBe(computeConfidenceScore(input));
  });
});

// ─── computeFreshness ────────────────────────────────────────────────────────

describe("computeFreshness", () => {
  it("returns 999 hours and stale=true for null input", () => {
    const result = computeFreshness(null, 72);
    expect(result.freshnessHours).toBe(999);
    expect(result.isStale).toBe(true);
  });

  it("returns 0 hours for very recent data", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const result = computeFreshness(recent, 72, now);
    expect(result.freshnessHours).toBe(0);
    expect(result.isStale).toBe(false);
  });

  it("marks stale when older than threshold", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 100 * 60 * 60 * 1000).toISOString();
    const result = computeFreshness(old, 72, now);
    expect(result.freshnessHours).toBe(100);
    expect(result.isStale).toBe(true);
  });

  it("marks fresh when within threshold", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const result = computeFreshness(recent, 72, now);
    expect(result.freshnessHours).toBe(48);
    expect(result.isStale).toBe(false);
  });
});

// ─── computeFullConfidence ───────────────────────────────────────────────────

describe("computeFullConfidence", () => {
  it("returns confidence=0 and is_stale=true for no data", () => {
    const result = computeFullConfidence(0, null, HEALTH_CONFIDENCE);
    expect(result.confidence_score).toBe(0);
    expect(result.is_stale).toBe(true);
    expect(result.sample_size).toBe(0);
  });

  it("returns confidence=0 for below-minimum samples", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const result = computeFullConfidence(1, recent, HEALTH_CONFIDENCE, now);
    expect(result.confidence_score).toBe(0);
  });

  it("returns positive confidence for sufficient samples", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const result = computeFullConfidence(5, recent, HEALTH_CONFIDENCE, now);
    expect(result.confidence_score).toBeGreaterThan(0);
    expect(result.is_stale).toBe(false);
  });

  it("uses domain-specific config correctly", () => {
    const now = new Date();
    const recent = now.toISOString();
    const healthConf = computeFullConfidence(5, recent, HEALTH_CONFIDENCE, now);
    const financeConf = computeFullConfidence(5, recent, FINANCIAL_CONFIDENCE, now);
    expect(healthConf.confidence_score).not.toBe(financeConf.confidence_score);
  });
});

// ─── Outlier damping ─────────────────────────────────────────────────────────

describe("dampValue", () => {
  it("returns original value when below soft cap", () => {
    expect(dampValue(10, 14, 0.5)).toBe(10);
  });

  it("returns soft cap when exactly at cap", () => {
    expect(dampValue(14, 14, 0.5)).toBe(14);
  });

  it("damps excess above soft cap", () => {
    const damped = dampValue(20, 14, 0.5);
    expect(damped).toBe(14 + (20 - 14) * 0.5);
    expect(damped).toBeLessThan(20);
    expect(damped).toBeGreaterThan(14);
  });
});

describe("dampHealthMetric", () => {
  it("does not damp normal values", () => {
    const result = dampHealthMetric({ sleep_hours: 7, exercise_minutes: 30 });
    expect(result.sleep_hours).toBe(7);
    expect(result.exercise_minutes).toBe(30);
  });

  it("damps extreme sleep hours", () => {
    const result = dampHealthMetric({ sleep_hours: 18, exercise_minutes: 30 });
    expect(result.sleep_hours).toBeLessThan(18);
    expect(result.sleep_hours).toBeGreaterThan(14);
  });

  it("damps extreme exercise minutes", () => {
    const result = dampHealthMetric({ sleep_hours: 7, exercise_minutes: 400 });
    expect(result.exercise_minutes).toBeLessThan(400);
    expect(result.exercise_minutes).toBeGreaterThan(240);
  });
});

// ─── Suspicious input detection ──────────────────────────────────────────────

describe("isHealthMetricSuspicious", () => {
  it("returns false for normal values", () => {
    expect(isHealthMetricSuspicious({ sleep_hours: 7, exercise_minutes: 30 })).toBe(false);
  });

  it("returns true for extreme sleep", () => {
    expect(isHealthMetricSuspicious({ sleep_hours: 16, exercise_minutes: 30 })).toBe(true);
  });

  it("returns true for extreme exercise", () => {
    expect(isHealthMetricSuspicious({ sleep_hours: 7, exercise_minutes: 300 })).toBe(true);
  });
});

describe("isDecisionSuspicious", () => {
  it("returns false for normal values", () => {
    expect(isDecisionSuspicious({ confidence_score: 7, emotional_intensity: 5 })).toBe(false);
  });

  it("returns true for max-max pattern", () => {
    expect(isDecisionSuspicious({ confidence_score: 10, emotional_intensity: 10 })).toBe(true);
  });
});
