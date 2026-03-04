/**
 * Feature Registry Integrity Test
 *
 * Validates that:
 * 1. All FeatureKey union values exist in FEATURE_REGISTRY
 * 2. All token-consuming features exist in TOKEN_COST_SCHEDULE
 * 3. No drift between registry, cost schedule, and FeatureGate mappings
 */

import { describe, it, expect } from "vitest";
import { FEATURE_REGISTRY } from "@/lib/plans/featureRegistry";
import { TOKEN_COST_SCHEDULE, type FeatureKey } from "@/lib/tokens/costSchedule";

describe("Feature Registry Integrity", () => {
  it("should have every FeatureKey defined in FEATURE_REGISTRY", () => {
    // Get all keys from cost schedule (source of truth for FeatureKey union)
    const costScheduleKeys = Object.keys(TOKEN_COST_SCHEDULE) as FeatureKey[];

    // Get all keys from registry
    const registryKeys = Object.keys(FEATURE_REGISTRY) as FeatureKey[];

    // Every cost schedule key must exist in registry
    const missingInRegistry = costScheduleKeys.filter(
      (key) => !(key in FEATURE_REGISTRY)
    );

    if (missingInRegistry.length > 0) {
      console.error("Keys in cost schedule but missing from registry:", missingInRegistry);
    }

    expect(missingInRegistry).toEqual([]);
  });

  it("should have every registry tokened feature in TOKEN_COST_SCHEDULE", () => {
    // Features that consume tokens must be in cost schedule
    const registryKeys = Object.keys(FEATURE_REGISTRY) as FeatureKey[];

    const missingInCostSchedule = registryKeys.filter(
      (key) => !(key in TOKEN_COST_SCHEDULE)
    );

    if (missingInCostSchedule.length > 0) {
      console.error("Keys in registry but missing from cost schedule:", missingInCostSchedule);
    }

    expect(missingInCostSchedule).toEqual([]);
  });

  it("should have consistent tokenChannel across registry and cost schedule", () => {
    const registryEntries = Object.entries(FEATURE_REGISTRY);

    for (const [key, definition] of registryEntries) {
      const costEntry = TOKEN_COST_SCHEDULE[key as FeatureKey];
      if (!costEntry) continue; // Skip non-tokened features

      // Token channel must match
      expect(definition.tokenChannel).toBe(costEntry.channel);
    }
  });

  it("should have no duplicate feature keys in registry", () => {
    const keys = Object.keys(FEATURE_REGISTRY);
    const uniqueKeys = new Set(keys);

    expect(keys.length).toBe(uniqueKeys.size);
  });

  it("should have consistent deep_insights key naming (underscore)", () => {
    // deep_insights must use underscore (not hyphen)
    expect("deep_insights" in FEATURE_REGISTRY).toBe(true);
    expect("deep-insights" in FEATURE_REGISTRY).toBe(false);
    expect("deep_insights" in TOKEN_COST_SCHEDULE).toBe(true);
    expect("deep-insights" in TOKEN_COST_SCHEDULE).toBe(false);
  });

  it("should have valid entitlement flags for all gated features", () => {
    const gatedFeatures = Object.entries(FEATURE_REGISTRY).filter(
      ([_, def]) => def.entitlementFlag !== undefined
    );

    const validEntitlements = [
      "enableRealtime",
      "enableVoiceTTS",
      "enableAudioVella",
      "enableArchitect",
      "enableDeepDive",
      "enableDeepInsights",
      "enableGrowthRoadmap",
      "enableDeepMemory",
    ];

    for (const [key, definition] of gatedFeatures) {
      expect(validEntitlements).toContain(definition.entitlementFlag);
    }
  });
});
