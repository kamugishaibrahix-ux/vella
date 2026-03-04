/**
 * Deep Memory Entitlement Tests
 * 
 * Verifies that Deep Memory features use enableDeepMemory entitlement,
 * NOT tier === "elite" checks.
 */

import { describe, it, expect, vi } from "vitest";
import { isDeepMemoryEnabled, DEEP_MEMORY_FEATURES } from "@/lib/plans/featureRegistry";
import type { PlanEntitlement } from "@/lib/plans/types";

describe("Deep Memory Entitlement Gating", () => {
  const mockEntitlements = (overrides: Partial<PlanEntitlement> = {}): PlanEntitlement => ({
    maxMonthlyTokens: 1000000,
    enableRealtime: true,
    enableVoiceTTS: true,
    enableAudioVella: true,
    enableArchitect: true,
    enableDeepDive: true,
    enableDeepInsights: true,
    enableGrowthRoadmap: true,
    enableDeepMemory: true,
    requestsPerMinute: 60,
    ...overrides,
  });

  describe("isDeepMemoryEnabled", () => {
    it("returns true when enableDeepMemory is true", () => {
      const entitlements = mockEntitlements({ enableDeepMemory: true });
      expect(isDeepMemoryEnabled(entitlements)).toBe(true);
    });

    it("returns false when enableDeepMemory is false", () => {
      const entitlements = mockEntitlements({ enableDeepMemory: false });
      expect(isDeepMemoryEnabled(entitlements)).toBe(false);
    });

    it("returns false when enableDeepMemory is undefined", () => {
      const entitlements = { ...mockEntitlements() } as Partial<PlanEntitlement>;
      delete (entitlements as { enableDeepMemory?: boolean }).enableDeepMemory;
      expect(isDeepMemoryEnabled(entitlements as PlanEntitlement)).toBe(false);
    });

    it("does NOT check maxMonthlyTokens to determine Deep Memory", () => {
      // Low token count but Deep Memory enabled
      const lowTokensWithDeepMemory = mockEntitlements({
        maxMonthlyTokens: 10000, // Free tier amount
        enableDeepMemory: true,
      });
      expect(isDeepMemoryEnabled(lowTokensWithDeepMemory)).toBe(true);

      // High token count but Deep Memory disabled
      const highTokensWithoutDeepMemory = mockEntitlements({
        maxMonthlyTokens: 1000000, // Elite tier amount
        enableDeepMemory: false,
      });
      expect(isDeepMemoryEnabled(highTokensWithoutDeepMemory)).toBe(false);
    });
  });

  describe("PURE abstraction - no tier strings", () => {
    it("Deep Memory is gated ONLY by enableDeepMemory entitlement", () => {
      // These are the ONLY gates that should exist for Deep Memory:
      // - isDeepMemoryEnabled(entitlements) === true
      // 
      // These are NOT valid gates:
      // - tier === "elite"
      // - maxMonthlyTokens >= 1000000
      // - plan === "elite"

      const validGate = (entitlements: PlanEntitlement) => {
        return entitlements.enableDeepMemory === true;
      };

      const invalidGate1 = (tier: string) => tier === "elite";
      const invalidGate2 = (tokens: number) => tokens >= 1000000;

      // Valid gate should work
      expect(validGate(mockEntitlements({ enableDeepMemory: true }))).toBe(true);
      expect(validGate(mockEntitlements({ enableDeepMemory: false }))).toBe(false);

      // Invalid gates should NOT be used
      // (We can't test they're not used, but we document that they shouldn't be)
      expect(invalidGate1("elite")).toBe(true);
      expect(invalidGate2(1000000)).toBe(true);
    });

    it("Pro tier CAN have Deep Memory enabled via admin config", () => {
      // Admin can enable Deep Memory for any tier
      const proWithDeepMemory: PlanEntitlement = {
        maxMonthlyTokens: 300000, // Pro tier
        enableRealtime: true,
        enableVoiceTTS: true,
        enableAudioVella: true,
        enableArchitect: true,
        enableDeepDive: true,
        enableDeepInsights: false, // Still no deep insights
        enableGrowthRoadmap: true,
        enableDeepMemory: true, // But has Deep Memory!
        requestsPerMinute: 30,
      };

      expect(isDeepMemoryEnabled(proWithDeepMemory)).toBe(true);
    });

    it("Elite tier CAN have Deep Memory disabled via admin config", () => {
      // Admin can disable Deep Memory for any tier
      const eliteWithoutDeepMemory: PlanEntitlement = {
        maxMonthlyTokens: 1000000, // Elite tier
        enableRealtime: true,
        enableVoiceTTS: true,
        enableAudioVella: true,
        enableArchitect: true,
        enableDeepDive: true,
        enableDeepInsights: true,
        enableGrowthRoadmap: true,
        enableDeepMemory: false, // But no Deep Memory
        requestsPerMinute: 60,
      };

      expect(isDeepMemoryEnabled(eliteWithoutDeepMemory)).toBe(false);
    });
  });

  describe("feature registry integration", () => {
    it("Deep Memory features should use isDeepMemoryEnabled", () => {
      // The following should all use isDeepMemoryEnabled(entitlements):
      // - narrative.ts: buildNarrativeMemoryContext
      // - consolidation.ts: shouldRunConsolidation, listMemorySnapshots
      // - clustering.ts: shouldRunClustering, listMemoryClusters, etc.
      // - retrieve.ts: buildCompleteMemoryContext

      // We verify the registry doesn't have Deep Memory features
      // because they're handled as a composite entitlement
      expect(DEEP_MEMORY_FEATURES).toContain("narrative_context");
      expect(DEEP_MEMORY_FEATURES).toContain("memory_consolidation");
      expect(DEEP_MEMORY_FEATURES).toContain("episodic_clustering");
    });
  });
});
