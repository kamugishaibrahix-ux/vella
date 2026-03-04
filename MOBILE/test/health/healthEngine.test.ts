/**
 * Physical Health & Energy Engine — Unit Tests
 * Tests deterministic computation functions only (no Supabase).
 */

import { describe, it, expect } from "vitest";
import {
  computeSleepDebt,
  computeRecoveryIndex,
  computeEnergyIndex,
  computeHealthVolatility,
  evaluateHealthGovernanceSignal,
  HEALTH_GOVERNANCE_WEIGHT,
} from "@/lib/health/healthEngine";
import type { HealthStateOutput } from "@/lib/health/healthEngine";

describe("computeSleepDebt", () => {
  it("returns 0 for empty input", () => {
    expect(computeSleepDebt([])).toBe(0);
  });

  it("returns 0 when all nights meet optimal sleep (8h)", () => {
    const days = Array.from({ length: 7 }, () => ({ sleep_hours: 8 }));
    expect(computeSleepDebt(days)).toBe(0);
  });

  it("returns max (100) for 7 nights of 0 sleep", () => {
    const days = Array.from({ length: 7 }, () => ({ sleep_hours: 0 }));
    expect(computeSleepDebt(days)).toBe(100);
  });

  it("accumulates partial debt for suboptimal sleep", () => {
    const days = Array.from({ length: 7 }, () => ({ sleep_hours: 6 }));
    const debt = computeSleepDebt(days);
    expect(debt).toBeGreaterThan(0);
    expect(debt).toBeLessThan(100);
  });

  it("handles fewer than 7 days", () => {
    const days = [{ sleep_hours: 4 }, { sleep_hours: 4 }];
    const debt = computeSleepDebt(days);
    expect(debt).toBeGreaterThan(0);
    expect(debt).toBeLessThan(100);
  });

  it("treats oversleep (>8h) as 0 debt", () => {
    const days = Array.from({ length: 7 }, () => ({ sleep_hours: 10 }));
    expect(computeSleepDebt(days)).toBe(0);
  });

  it("is deterministic (same input → same output)", () => {
    const days = [
      { sleep_hours: 5 }, { sleep_hours: 7 }, { sleep_hours: 6 },
      { sleep_hours: 8 }, { sleep_hours: 4 }, { sleep_hours: 7 },
      { sleep_hours: 6 },
    ];
    const a = computeSleepDebt(days);
    const b = computeSleepDebt(days);
    expect(a).toBe(b);
  });
});

describe("computeRecoveryIndex", () => {
  it("returns 0 for 0 exercise and sleep quality 0", () => {
    expect(computeRecoveryIndex(0, 0)).toBe(0);
  });

  it("returns ~50 for moderate exercise (30min) and mid sleep quality (5)", () => {
    const index = computeRecoveryIndex(30, 5);
    expect(index).toBeGreaterThanOrEqual(40);
    expect(index).toBeLessThanOrEqual(60);
  });

  it("caps at 100", () => {
    const index = computeRecoveryIndex(120, 10);
    expect(index).toBe(100);
  });

  it("exercise caps at 60 minutes contribution", () => {
    const at60 = computeRecoveryIndex(60, 5);
    const at120 = computeRecoveryIndex(120, 5);
    expect(at60).toBe(at120);
  });
});

describe("computeEnergyIndex", () => {
  it("returns balanced index for mid-range inputs", () => {
    const index = computeEnergyIndex(5, 50, 50);
    expect(index).toBeGreaterThanOrEqual(20);
    expect(index).toBeLessThanOrEqual(50);
  });

  it("returns high index for optimal conditions", () => {
    const index = computeEnergyIndex(10, 0, 100);
    expect(index).toBe(100);
  });

  it("returns low index for worst conditions", () => {
    const index = computeEnergyIndex(1, 100, 0);
    expect(index).toBeLessThanOrEqual(10);
  });

  it("weights energy level at 40%", () => {
    const highEnergy = computeEnergyIndex(10, 50, 50);
    const lowEnergy = computeEnergyIndex(1, 50, 50);
    expect(highEnergy - lowEnergy).toBeGreaterThanOrEqual(30);
  });
});

describe("computeHealthVolatility", () => {
  it("returns false for < 2 data points", () => {
    expect(computeHealthVolatility([])).toBe(false);
    expect(computeHealthVolatility([{ energy_level: 5 }])).toBe(false);
  });

  it("returns false for stable energy levels", () => {
    expect(computeHealthVolatility([
      { energy_level: 5 }, { energy_level: 5 }, { energy_level: 6 },
    ])).toBe(false);
  });

  it("returns true for wildly fluctuating energy", () => {
    expect(computeHealthVolatility([
      { energy_level: 1 }, { energy_level: 10 }, { energy_level: 2 },
    ])).toBe(true);
  });

  it("threshold is stddev > 2.5", () => {
    expect(computeHealthVolatility([
      { energy_level: 2 }, { energy_level: 9 }, { energy_level: 2 },
    ])).toBe(true);

    expect(computeHealthVolatility([
      { energy_level: 5 }, { energy_level: 6 }, { energy_level: 5 },
    ])).toBe(false);
  });
});

describe("evaluateHealthGovernanceSignal", () => {
  it("returns null when no thresholds breached", () => {
    const state: HealthStateOutput = {
      energy_index: 70,
      sleep_debt_score: 30,
      recovery_index: 60,
      volatility_flag: false,
    };
    expect(evaluateHealthGovernanceSignal(state)).toBeNull();
  });

  it("fires when sleep_debt_score > threshold", () => {
    const state: HealthStateOutput = {
      energy_index: 40,
      sleep_debt_score: HEALTH_GOVERNANCE_WEIGHT.sleep_debt_threshold + 1,
      recovery_index: 50,
      volatility_flag: false,
    };
    const signal = evaluateHealthGovernanceSignal(state);
    expect(signal).not.toBeNull();
    expect(signal!.focus_intensity_reduction).toBe(true);
    expect(signal!.domain_flag).toBe("health_risk");
  });

  it("fires when recovery_index < threshold", () => {
    const state: HealthStateOutput = {
      energy_index: 40,
      sleep_debt_score: 20,
      recovery_index: HEALTH_GOVERNANCE_WEIGHT.recovery_threshold - 1,
      volatility_flag: false,
    };
    const signal = evaluateHealthGovernanceSignal(state);
    expect(signal).not.toBeNull();
    expect(signal!.risk_increment).toBe(HEALTH_GOVERNANCE_WEIGHT.risk_increment);
  });

  it("fires when both thresholds breached", () => {
    const state: HealthStateOutput = {
      energy_index: 10,
      sleep_debt_score: 90,
      recovery_index: 10,
      volatility_flag: true,
    };
    expect(evaluateHealthGovernanceSignal(state)).not.toBeNull();
  });
});
