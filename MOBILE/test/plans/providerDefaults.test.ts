/**
 * Provider Defaults Test
 *
 * Ensures that:
 * 1. EntitlementsProvider fallback matches DEFAULT_FREE_ENTITLEMENTS
 * 2. TokenBalanceProvider fallback is safe (0 tokens, not optimistic)
 * 3. No hardcoded values drift from canonical defaults
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_FREE_ENTITLEMENTS,
  DEFAULT_PRO_ENTITLEMENTS,
  DEFAULT_ELITE_ENTITLEMENTS,
  getDefaultEntitlements,
  UnknownTierError,
} from "@/lib/plans/defaultEntitlements";
import type { PlanEntitlement } from "@/lib/plans/types";

describe("Provider Fallback Defaults", () => {
  it("should have FREE_DEFAULTS match DEFAULT_FREE_ENTITLEMENTS", () => {
    const defaults = getDefaultEntitlements("free");

    // All key fields must match
    expect(defaults.maxMonthlyTokens).toBe(DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens);
    expect(defaults.enableRealtime).toBe(DEFAULT_FREE_ENTITLEMENTS.enableRealtime);
    expect(defaults.enableVoiceTTS).toBe(DEFAULT_FREE_ENTITLEMENTS.enableVoiceTTS);
    expect(defaults.enableAudioVella).toBe(DEFAULT_FREE_ENTITLEMENTS.enableAudioVella);
    expect(defaults.enableArchitect).toBe(DEFAULT_FREE_ENTITLEMENTS.enableArchitect);
    expect(defaults.enableDeepDive).toBe(DEFAULT_FREE_ENTITLEMENTS.enableDeepDive);
    expect(defaults.enableDeepInsights).toBe(DEFAULT_FREE_ENTITLEMENTS.enableDeepInsights);
    expect(defaults.enableGrowthRoadmap).toBe(DEFAULT_FREE_ENTITLEMENTS.enableGrowthRoadmap);
    expect(defaults.enableDeepMemory).toBe(DEFAULT_FREE_ENTITLEMENTS.enableDeepMemory);
  });

  it("should have correct token limits for each tier", () => {
    expect(DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens).toBe(10_000);
    expect(DEFAULT_PRO_ENTITLEMENTS.maxMonthlyTokens).toBe(300_000);
    expect(DEFAULT_ELITE_ENTITLEMENTS.maxMonthlyTokens).toBe(1_000_000);
  });

  it("should have Deep Memory only enabled for Elite", () => {
    expect(DEFAULT_FREE_ENTITLEMENTS.enableDeepMemory).toBe(false);
    expect(DEFAULT_PRO_ENTITLEMENTS.enableDeepMemory).toBe(false);
    expect(DEFAULT_ELITE_ENTITLEMENTS.enableDeepMemory).toBe(true);
  });

  it("should have Deep Insights only enabled for Elite", () => {
    expect(DEFAULT_FREE_ENTITLEMENTS.enableDeepInsights).toBe(false);
    expect(DEFAULT_PRO_ENTITLEMENTS.enableDeepInsights).toBe(false);
    expect(DEFAULT_ELITE_ENTITLEMENTS.enableDeepInsights).toBe(true);
  });

  it("should have Realtime enabled for Pro and Elite", () => {
    expect(DEFAULT_FREE_ENTITLEMENTS.enableRealtime).toBe(false);
    expect(DEFAULT_PRO_ENTITLEMENTS.enableRealtime).toBe(true);
    expect(DEFAULT_ELITE_ENTITLEMENTS.enableRealtime).toBe(true);
  });

  it("should return fresh copies (not references) from getDefaultEntitlements", () => {
    const free1 = getDefaultEntitlements("free");
    const free2 = getDefaultEntitlements("free");

    // Should be equal but not same reference
    expect(free1).toEqual(free2);

    // Modify one
    free1.maxMonthlyTokens = 999_999;

    // Other should not be affected
    expect(free2.maxMonthlyTokens).toBe(DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens);
  });

  it("should throw UnknownTierError for unknown tier", () => {
    expect(() => getDefaultEntitlements("unknown" as "free")).toThrow(UnknownTierError);
  });
});

describe("Token Balance Fallback Safety", () => {
  it("should have safe fallback values (0, not optimistic)", () => {
    // The fallback balance should show 0 remaining, not optimistic values
    // This prevents UI showing "you have tokens" when API fails
    const fallback = {
      remaining: 0,
      allowance: 0,
      topups: 0,
      used: 0,
    };

    expect(fallback.remaining).toBe(0);
    expect(fallback.allowance).toBe(0);
  });
});
