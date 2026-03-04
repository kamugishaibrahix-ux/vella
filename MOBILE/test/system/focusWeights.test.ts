/**
 * Focus Area Weighting — Unit Tests
 * Tests domain weight computation from selected focus areas.
 */

import { describe, it, expect } from "vitest";
import {
  computeDomainWeights,
  isDomainSelected,
} from "@/lib/system/focusWeights";
import {
  computeGlobalStability,
  findDominantRiskDomain,
  DOMAIN_STRESS_THRESHOLD,
} from "@/lib/system/masterStateEngine";
import type { FocusDomain } from "@/lib/focusAreas";

describe("computeDomainWeights", () => {
  it("returns equal weights when no domains selected", () => {
    const weights = computeDomainWeights([]);
    const values = Object.values(weights);
    const allEqual = values.every((v) => Math.abs(v - values[0]) < 0.001);
    expect(allEqual).toBe(true);
  });

  it("returns normalised weights that sum to ~1.0", () => {
    const weights = computeDomainWeights(["physical-health", "financial-discipline"]);
    const sum = weights.health + weights.financial + weights.cognitive + weights.behavioural + weights.governance;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it("gives selected domains higher weight than unselected", () => {
    const weights = computeDomainWeights(["physical-health"]);
    expect(weights.health).toBeGreaterThan(weights.financial);
    expect(weights.health).toBeGreaterThan(weights.cognitive);
    expect(weights.health).toBeGreaterThan(weights.governance);
  });

  it("maps physical-health to health domain", () => {
    const weights = computeDomainWeights(["physical-health"]);
    expect(weights.health).toBeGreaterThan(weights.financial);
  });

  it("maps financial-discipline to financial domain", () => {
    const weights = computeDomainWeights(["financial-discipline"]);
    expect(weights.financial).toBeGreaterThan(weights.health);
  });

  it("maps emotional-intelligence to cognitive domain", () => {
    const weights = computeDomainWeights(["emotional-intelligence"]);
    expect(weights.cognitive).toBeGreaterThan(weights.health);
  });

  it("maps self-mastery to behavioural domain", () => {
    const weights = computeDomainWeights(["self-mastery"]);
    expect(weights.behavioural).toBeGreaterThan(weights.health);
  });

  it("maps addiction-recovery to governance domain", () => {
    const weights = computeDomainWeights(["addiction-recovery"]);
    expect(weights.governance).toBeGreaterThan(weights.health);
  });

  it("caps at 3 selected domains", () => {
    const allFour: FocusDomain[] = [
      "physical-health", "financial-discipline", "emotional-intelligence", "self-mastery",
    ];
    const weights = computeDomainWeights(allFour);
    const sum = weights.health + weights.financial + weights.cognitive + weights.behavioural + weights.governance;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it("handles duplicate focus domains gracefully", () => {
    const weights = computeDomainWeights(["physical-health", "physical-health"]);
    const sum = weights.health + weights.financial + weights.cognitive + weights.behavioural + weights.governance;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
    expect(weights.health).toBeGreaterThan(weights.financial);
  });
});

describe("isDomainSelected", () => {
  it("returns true when domain is mapped from selected focus area", () => {
    expect(isDomainSelected("health", ["physical-health"])).toBe(true);
    expect(isDomainSelected("financial", ["financial-discipline"])).toBe(true);
    expect(isDomainSelected("cognitive", ["emotional-intelligence"])).toBe(true);
  });

  it("returns false when domain is not selected", () => {
    expect(isDomainSelected("health", ["financial-discipline"])).toBe(false);
    expect(isDomainSelected("financial", ["physical-health"])).toBe(false);
  });

  it("returns false for empty selection", () => {
    expect(isDomainSelected("health", [])).toBe(false);
  });
});

describe("focus weight integration with master state", () => {
  it("selected domain weighting changes dominant risk domain in close ties", () => {
    const stressMap = {
      health: 70,
      financial: 68,
      cognitive: 30,
      behavioural: 20,
      governance: 10,
      none: 0,
    };

    const dominantNoFocus = findDominantRiskDomain(stressMap);
    expect(dominantNoFocus).toBe("health");

    const dominantWithFocus = findDominantRiskDomain(stressMap, ["financial-discipline"]);
    expect(dominantWithFocus).toBe("financial");
  });

  it("selected domain weights affect global stability score", () => {
    const stressMap = {
      health: 80,
      financial: 20,
      cognitive: 20,
      behavioural: 20,
      governance: 20,
      none: 0,
    };

    const defaultWeights = computeDomainWeights([]);
    const healthFocusWeights = computeDomainWeights(["physical-health"]);

    const stabilityDefault = computeGlobalStability(stressMap, defaultWeights);
    const stabilityHealthFocus = computeGlobalStability(stressMap, healthFocusWeights);

    expect(stabilityHealthFocus).toBeLessThan(stabilityDefault);
  });
});
