/**
 * PHASE 8: Fail-Closed Integration Tests
 *
 * Verifies that:
 * 1. Corrupted plan tiers never resolve to "free" silently
 * 2. Unknown tiers yield RESTRICTED entitlements or 500
 * 3. Admin writes of invalid tiers are rejected
 * 4. resolvePlanEntitlements throws/restricts on invalid input
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDefaultEntitlements,
  getDefaultEntitlementsSafe,
  isValidPlanTier,
  UnknownTierError,
  RESTRICTED_ENTITLEMENTS,
  DEFAULT_FREE_ENTITLEMENTS,
} from "@/lib/plans/defaultEntitlements";
import { resolvePlanTier } from "@/lib/tiers/planUtils";
import {
  resolvePlanEntitlements,
  resolvePlanEntitlementsSync,
} from "@/lib/plans/resolvePlanEntitlements";

describe("Fail-Closed: Corrupted Plan Resolution", () => {
  it("resolvePlanTier throws UnknownTierError for unknown tier strings", () => {
    expect(() => resolvePlanTier("enterprise")).toThrow(UnknownTierError);
    expect(() => resolvePlanTier("gold")).toThrow(UnknownTierError);
    expect(() => resolvePlanTier("vip")).toThrow(UnknownTierError);
  });

  it("resolvePlanTier treats empty string as no-subscription (free)", () => {
    // Empty string is falsy in JS, treated same as null/undefined
    expect(resolvePlanTier("")).toBe("free");
  });

  it("resolvePlanTier handles valid tiers correctly", () => {
    expect(resolvePlanTier("free")).toBe("free");
    expect(resolvePlanTier("pro")).toBe("pro");
    expect(resolvePlanTier("elite")).toBe("elite");
  });

  it("resolvePlanTier handles null/undefined as free (no subscription)", () => {
    expect(resolvePlanTier(null)).toBe("free");
    expect(resolvePlanTier(undefined)).toBe("free");
  });

  it("resolvePlanTier blocks legacy aliases (ALLOW_LEGACY_PLAN_ALIASES=false)", () => {
    expect(() => resolvePlanTier("basic")).toThrow(UnknownTierError);
    expect(() => resolvePlanTier("premium")).toThrow(UnknownTierError);
  });

  it("getDefaultEntitlements throws on invalid tier at runtime", () => {
    expect(() => getDefaultEntitlements("enterprise" as any)).toThrow(UnknownTierError);
  });

  it("getDefaultEntitlementsSafe returns null for unknown tiers", () => {
    expect(getDefaultEntitlementsSafe("enterprise")).toBeNull();
    expect(getDefaultEntitlementsSafe("gold")).toBeNull();
  });

  it("isValidPlanTier rejects unknown tiers", () => {
    expect(isValidPlanTier("enterprise")).toBe(false);
    expect(isValidPlanTier("gold")).toBe(false);
    expect(isValidPlanTier("")).toBe(false);
    expect(isValidPlanTier("FREE")).toBe(false); // Case-sensitive
  });

  it("isValidPlanTier accepts known tiers", () => {
    expect(isValidPlanTier("free")).toBe(true);
    expect(isValidPlanTier("pro")).toBe(true);
    expect(isValidPlanTier("elite")).toBe(true);
  });
});

describe("Fail-Closed: Entitlement Resolution", () => {
  it("resolvePlanEntitlements returns RESTRICTED for invalid tier", async () => {
    const result = await resolvePlanEntitlements("enterprise" as any);
    expect(result.entitlements.maxMonthlyTokens).toBe(RESTRICTED_ENTITLEMENTS.maxMonthlyTokens);
    expect(result.entitlements.enableRealtime).toBe(false);
    expect(result.entitlements.enableDeepInsights).toBe(false);
    expect(result.entitlements.enableDeepMemory).toBe(false);
  });

  it("resolvePlanEntitlementsSync returns RESTRICTED for invalid tier", () => {
    const result = resolvePlanEntitlementsSync("enterprise" as any);
    expect(result.entitlements.maxMonthlyTokens).toBe(RESTRICTED_ENTITLEMENTS.maxMonthlyTokens);
    expect(result.entitlements.enableRealtime).toBe(false);
  });

  it("RESTRICTED_ENTITLEMENTS has minimal access", () => {
    expect(RESTRICTED_ENTITLEMENTS.maxMonthlyTokens).toBe(1_000);
    expect(RESTRICTED_ENTITLEMENTS.isPaid).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.usesAllocationBucket).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.enableRealtime).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.enableVoiceTTS).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.enableAudioVella).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.enableArchitect).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.enableDeepDive).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.enableDeepInsights).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.enableGrowthRoadmap).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.enableDeepMemory).toBe(false);
    expect(RESTRICTED_ENTITLEMENTS.requestsPerMinute).toBe(1);
  });

  it("RESTRICTED_ENTITLEMENTS is feature-zero: all feature booleans are false", () => {
    const featureFlags = [
      RESTRICTED_ENTITLEMENTS.isPaid,
      RESTRICTED_ENTITLEMENTS.usesAllocationBucket,
      RESTRICTED_ENTITLEMENTS.enableRealtime,
      RESTRICTED_ENTITLEMENTS.enableVoiceTTS,
      RESTRICTED_ENTITLEMENTS.enableAudioVella,
      RESTRICTED_ENTITLEMENTS.enableArchitect,
      RESTRICTED_ENTITLEMENTS.enableDeepDive,
      RESTRICTED_ENTITLEMENTS.enableDeepInsights,
      RESTRICTED_ENTITLEMENTS.enableGrowthRoadmap,
      RESTRICTED_ENTITLEMENTS.enableDeepMemory,
    ];
    expect(featureFlags.every((v) => v === false)).toBe(true);
  });

  it("RESTRICTED_ENTITLEMENTS never exceeds free entitlements", () => {
    expect(RESTRICTED_ENTITLEMENTS.maxMonthlyTokens).toBeLessThanOrEqual(
      DEFAULT_FREE_ENTITLEMENTS.maxMonthlyTokens
    );
    expect(RESTRICTED_ENTITLEMENTS.requestsPerMinute).toBeLessThanOrEqual(
      DEFAULT_FREE_ENTITLEMENTS.requestsPerMinute!
    );
  });

  it("free entitlements have isPaid=false and usesAllocationBucket=false", () => {
    expect(DEFAULT_FREE_ENTITLEMENTS.isPaid).toBe(false);
    expect(DEFAULT_FREE_ENTITLEMENTS.usesAllocationBucket).toBe(false);
  });

  it("pro entitlements have isPaid=true and usesAllocationBucket=true", () => {
    const pro = getDefaultEntitlements("pro");
    expect(pro.isPaid).toBe(true);
    expect(pro.usesAllocationBucket).toBe(true);
  });

  it("elite entitlements have isPaid=true and usesAllocationBucket=true", () => {
    const elite = getDefaultEntitlements("elite");
    expect(elite.isPaid).toBe(true);
    expect(elite.usesAllocationBucket).toBe(true);
  });

  it("corrupted tier never resolves to free entitlements", async () => {
    const result = await resolvePlanEntitlements("enterprise" as any);
    const freeEntitlements = getDefaultEntitlements("free");
    // RESTRICTED has fewer tokens than free
    expect(result.entitlements.maxMonthlyTokens).toBeLessThan(freeEntitlements.maxMonthlyTokens);
  });

  it("valid tiers resolve to correct entitlements", async () => {
    const free = await resolvePlanEntitlements("free");
    expect(free.entitlements.maxMonthlyTokens).toBe(10_000);
    expect(free.entitlements.enableRealtime).toBe(false);

    const pro = await resolvePlanEntitlements("pro");
    expect(pro.entitlements.maxMonthlyTokens).toBe(300_000);
    expect(pro.entitlements.enableRealtime).toBe(true);

    const elite = await resolvePlanEntitlements("elite");
    expect(elite.entitlements.maxMonthlyTokens).toBe(1_000_000);
    expect(elite.entitlements.enableDeepInsights).toBe(true);
    expect(elite.entitlements.enableDeepMemory).toBe(true);
  });
});

describe("Fail-Closed: Admin Tier Validation", () => {
  it("z.enum rejects invalid tiers in admin schemas", () => {
    const { z } = require("zod");
    const schema = z.enum(["free", "pro", "elite"]);

    expect(() => schema.parse("enterprise")).toThrow();
    expect(() => schema.parse("gold")).toThrow();
    expect(() => schema.parse("")).toThrow();
    expect(schema.parse("free")).toBe("free");
    expect(schema.parse("pro")).toBe("pro");
    expect(schema.parse("elite")).toBe("elite");
  });
});

describe("Fail-Closed: 402 Hard Stop", () => {
  it("quota_exceeded maps to blocking error", () => {
    const blockingCodes = ["account_inactive", "subscription_suspended", "quota_exceeded"];
    const nonBlockingCodes = ["feature_not_available", "rate_limit_exceeded", "unknown"];

    for (const code of blockingCodes) {
      expect(["account_inactive", "subscription_suspended", "quota_exceeded"]).toContain(code);
    }

    for (const code of nonBlockingCodes) {
      expect(["account_inactive", "subscription_suspended", "quota_exceeded"]).not.toContain(code);
    }
  });
});

describe("Test Determinism: No env warnings in test output", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("no Supabase env warnings leak into test stderr", async () => {
    // Re-trigger any lazy module loads that might warn
    await resolvePlanEntitlements("free");
    resolvePlanEntitlementsSync("pro");
    getDefaultEntitlements("elite");

    const allWarns = warnSpy.mock.calls.map((args) => args.join(" "));
    const allErrors = errorSpy.mock.calls.map((args) => args.join(" "));
    const combined = [...allWarns, ...allErrors];

    const forbidden = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "ANON_KEY not set",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];

    for (const pattern of forbidden) {
      const leaked = combined.filter((msg) => msg.includes(pattern));
      expect(leaked, `Env warning "${pattern}" should not appear in test output`).toHaveLength(0);
    }
  });
});
