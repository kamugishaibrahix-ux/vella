/**
 * No Silent Fallback Test
 * 
 * Verifies that the contract NEVER silently falls back to free tier
 * for unknown plan names. This was a critical vulnerability in the
 * previous implementation.
 * 
 * HARDENING REQUIREMENT:
 * - Unknown tier in logic path → must throw or return explicit error
 * - Unknown tier in UI path → must show error state, not "free" badge
 * - Unknown tier in enforcement → must use RESTRICTED entitlements
 */

import {
  getDefaultEntitlements,
  getDefaultEntitlementsSafe,
  getRestrictedEntitlements,
  UnknownTierError,
  DEFAULT_FREE_ENTITLEMENTS,
  RESTRICTED_ENTITLEMENTS,
} from "../src";

describe("NO SILENT FALLBACK - Critical Security Test", () => {
  const unknownTiers = [
    "unknown",
    "pro-plus",
    "enterprise",
    "basic",
    "premium",
    "trial",
    "beta",
    "staff",
    "internal",
    "",
    "null",
    "undefined",
    "FREE", // wrong case
    "Pro",  // wrong case
    "ELITE", // wrong case
  ];

  describe("getDefaultEntitlements must NOT silently fallback", () => {
    unknownTiers.forEach((tier) => {
      it(`throws for "${tier}" instead of returning free entitlements`, () => {
        // Should throw, not return free entitlements
        expect(() => getDefaultEntitlements(tier as any)).toThrow(UnknownTierError);
      });
    });
  });

  describe("getDefaultEntitlementsSafe must NOT silently fallback", () => {
    unknownTiers.forEach((tier) => {
      it(`returns failure result for "${tier}" instead of free entitlements`, () => {
        const result = getDefaultEntitlementsSafe(tier);
        
        // Must return failure, not success with free entitlements
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error).toBeInstanceOf(UnknownTierError);
          expect(result.error.tier).toBe(tier);
        }
        
        // If success (which would be wrong), check that it's NOT free entitlements
        if (result.success) {
          // This should never happen - if it does, the test fails
          expect(result.entitlements.maxMonthlyTokens).not.toBe(
            DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens
          );
        }
      });
    });
  });

  describe("getRestrictedEntitlements uses RESTRICTED, not FREE", () => {
    unknownTiers.forEach((tier) => {
      it(`returns RESTRICTED (not FREE) entitlements for "${tier}"`, () => {
        const result = getRestrictedEntitlements(tier);
        
        // Must be restricted entitlements (1k tokens), not free (10k tokens)
        expect(result.maxMonthlyTokens).toBe(RESTRICTED_ENTITLEMENTS.maxMonthlyTokens);
        expect(result.maxMonthlyTokens).not.toBe(DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens);
        
        // All premium features must be disabled
        expect(result.enableRealtime).toBe(false);
        expect(result.enableDeepMemory).toBe(false);
        expect(result.enableDeepInsights).toBe(false);
      });
    });
  });

  describe("explicit error shape", () => {
    it("UnknownTierError has all required fields", () => {
      const error = new UnknownTierError("test-tier", "test-context");
      
      expect(error.name).toBe("UnknownTierError");
      expect(error.tier).toBe("test-tier");
      expect(error.context).toBe("test-context");
      expect(error.message).toContain("test-tier");
      expect(error.message).toContain("test-context");
      expect(error.message).toContain("Unknown tier");
    });

    it("error can be identified by name", () => {
      try {
        getDefaultEntitlements("bad-tier" as any);
      } catch (err) {
        expect(err.name).toBe("UnknownTierError");
        expect(err instanceof UnknownTierError).toBe(true);
      }
    });
  });

  describe("legacy aliases handled correctly", () => {
    it("'basic' is NOT a valid tier (must normalize first)", () => {
      // 'basic' was previously an alias for free, but should not be accepted
      expect(() => getDefaultEntitlements("basic" as any)).toThrow(UnknownTierError);
    });

    it("'premium' is NOT a valid tier (must normalize first)", () => {
      // 'premium' was previously an alias for elite, but should not be accepted
      expect(() => getDefaultEntitlements("premium" as any)).toThrow(UnknownTierError);
    });
  });
});
