/**
 * Contract Entitlements - Strict Mode Tests
 * 
 * Verifies fail-closed behavior for unknown tiers.
 * Unknown tiers must NOT silently fall back to free.
 */

import {
  getDefaultEntitlements,
  getDefaultEntitlementsSafe,
  getRestrictedEntitlements,
  getTierTokenLimit,
  getTierTokenLimitSafe,
  DEFAULT_FREE_ENTITLEMENTS,
  DEFAULT_PRO_ENTITLEMENTS,
  DEFAULT_ELITE_ENTITLEMENTS,
  RESTRICTED_ENTITLEMENTS,
  UnknownTierError,
  isValidPlanTier,
} from "../src";

describe("Contract Entitlements - Strict Mode", () => {
  describe("getDefaultEntitlements (strict)", () => {
    it("returns free entitlements for 'free' tier", () => {
      const result = getDefaultEntitlements("free");
      expect(result.maxMonthlyTokens).toBe(DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens);
      expect(result.enableRealtime).toBe(false);
    });

    it("returns pro entitlements for 'pro' tier", () => {
      const result = getDefaultEntitlements("pro");
      expect(result.maxMonthlyTokens).toBe(DEFAULT_PRO_ENTITLEMENTS.maxMonthlyTokens);
      expect(result.enableRealtime).toBe(true);
      expect(result.enableDeepInsights).toBe(false);
    });

    it("returns elite entitlements for 'elite' tier", () => {
      const result = getDefaultEntitlements("elite");
      expect(result.maxMonthlyTokens).toBe(DEFAULT_ELITE_ENTITLEMENTS.maxMonthlyTokens);
      expect(result.enableDeepInsights).toBe(true);
      expect(result.enableDeepMemory).toBe(true);
    });

    it("throws UnknownTierError for unknown tier", () => {
      expect(() => getDefaultEntitlements("unknown" as any)).toThrow(UnknownTierError);
      expect(() => getDefaultEntitlements("pro-plus" as any)).toThrow(UnknownTierError);
      expect(() => getDefaultEntitlements("enterprise" as any)).toThrow(UnknownTierError);
    });

    it("error message includes tier name and context", () => {
      try {
        getDefaultEntitlements("invalid-tier" as any);
        fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(UnknownTierError);
        expect(err.name).toBe("UnknownTierError");
        expect(err.tier).toBe("invalid-tier");
        expect(err.context).toBe("getDefaultEntitlements");
        expect(err.message).toContain("invalid-tier");
      }
    });
  });

  describe("getDefaultEntitlementsSafe (Result type)", () => {
    it("returns success result for valid tier", () => {
      const result = getDefaultEntitlementsSafe("pro");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.entitlements.maxMonthlyTokens).toBe(DEFAULT_PRO_ENTITLEMENTS.maxMonthlyTokens);
        expect(result.plan).toBe("pro");
      }
    });

    it("returns failure result for unknown tier", () => {
      const result = getDefaultEntitlementsSafe("unknown");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(UnknownTierError);
        expect(result.error.tier).toBe("unknown");
      }
    });

    it("never returns entitlements for unknown tier", () => {
      const result = getDefaultEntitlementsSafe("not-a-real-tier");
      expect(result.success).toBe(false);
    });
  });

  describe("getRestrictedEntitlements (fail-closed)", () => {
    it("returns restricted entitlements for any unknown tier", () => {
      const result = getRestrictedEntitlements("unknown");
      expect(result.maxMonthlyTokens).toBe(RESTRICTED_ENTITLEMENTS.maxMonthlyTokens);
      expect(result.enableRealtime).toBe(false);
      expect(result.enableDeepInsights).toBe(false);
      expect(result.enableDeepMemory).toBe(false);
    });

    it("has minimal token allocation", () => {
      expect(RESTRICTED_ENTITLEMENTS.maxMonthlyTokens).toBe(1_000);
    });

    it("has all premium features disabled", () => {
      expect(RESTRICTED_ENTITLEMENTS.enableRealtime).toBe(false);
      expect(RESTRICTED_ENTITLEMENTS.enableVoiceTTS).toBe(false);
      expect(RESTRICTED_ENTITLEMENTS.enableDeepInsights).toBe(false);
      expect(RESTRICTED_ENTITLEMENTS.enableDeepMemory).toBe(false);
    });
  });

  describe("getTierTokenLimit (strict)", () => {
    it("returns correct token limits for valid tiers", () => {
      expect(getTierTokenLimit("free")).toBe(10_000);
      expect(getTierTokenLimit("pro")).toBe(300_000);
      expect(getTierTokenLimit("elite")).toBe(1_000_000);
    });

    it("throws for unknown tier", () => {
      expect(() => getTierTokenLimit("unknown" as any)).toThrow(UnknownTierError);
    });
  });

  describe("getTierTokenLimitSafe", () => {
    it("returns token limit for valid tier", () => {
      expect(getTierTokenLimitSafe("pro")).toBe(300_000);
    });

    it("returns null for unknown tier", () => {
      expect(getTierTokenLimitSafe("unknown")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getTierTokenLimitSafe("")).toBeNull();
    });
  });

  describe("isValidPlanTier", () => {
    it("returns true for valid tiers", () => {
      expect(isValidPlanTier("free")).toBe(true);
      expect(isValidPlanTier("pro")).toBe(true);
      expect(isValidPlanTier("elite")).toBe(true);
    });

    it("returns false for unknown tiers", () => {
      expect(isValidPlanTier("unknown")).toBe(false);
      expect(isValidPlanTier("pro-plus")).toBe(false);
      expect(isValidPlanTier("enterprise")).toBe(false);
      expect(isValidPlanTier("")).toBe(false);
    });

    it("is case-sensitive (lowercase only)", () => {
      expect(isValidPlanTier("Free")).toBe(false);
      expect(isValidPlanTier("PRO")).toBe(false);
      expect(isValidPlanTier("Elite")).toBe(false);
    });
  });

  describe("token values must match expected", () => {
    it("free tier has 10k tokens", () => {
      expect(DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens).toBe(10_000);
    });

    it("pro tier has 300k tokens", () => {
      expect(DEFAULT_PRO_ENTITLEMENTS.maxMonthlyTokens).toBe(300_000);
    });

    it("elite tier has 1M tokens", () => {
      expect(DEFAULT_ELITE_ENTITLEMENTS.maxMonthlyTokens).toBe(1_000_000);
    });
  });
});
