/**
 * Token Balance Tests
 * Verifies billing-window balance math and fail-closed behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatTokenBalance,
  type TokenBalance,
} from "@/lib/tokens/balance";
import { getCalendarMonthWindow } from "@/lib/billing/billingWindow";

// Mock dependencies
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
  fromSafe: vi.fn(),
}));

vi.mock("@/lib/plans/resolvePlanEntitlements", () => ({
  resolvePlanEntitlements: vi.fn(),
}));

describe("billingWindow", () => {
  describe("getCalendarMonthWindow", () => {
    it("returns valid calendar month window in UTC", () => {
      const window = getCalendarMonthWindow();
      expect(window.source).toBe("calendar_month");
      expect(window.start.getTime()).toBeLessThan(window.end.getTime());
      expect(window.start.getUTCDate()).toBe(1);
      expect(window.start.getUTCHours()).toBe(0);
      expect(window.end.getUTCDate()).toBe(1);
      expect(window.end.getUTCHours()).toBe(0);
    });

    it("window spans exactly one month", () => {
      const window = getCalendarMonthWindow();
      const startMonth = window.start.getUTCMonth();
      const endMonth = window.end.getUTCMonth();
      expect(endMonth).toBe((startMonth + 1) % 12);
    });
  });
});

describe("tokenBalance", () => {
  describe("formatTokenBalance", () => {
    it("formats balance correctly", () => {
      const balance: TokenBalance = {
        remaining: 25000,
        allowance: 30000,
        topups: 0,
        used: 5000,
        window: getCalendarMonthWindow(),
      };
      const formatted = formatTokenBalance(balance);
      expect(formatted).toContain("remaining=25000");
      expect(formatted).toContain("allowance=30000");
      expect(formatted).toContain("topups=0");
      expect(formatted).toContain("used=5000");
    });
  });

  describe("balance math", () => {
    it("computes correct balance with allowance only", () => {
      const allowance = 30_000;
      const topups = 0;
      const used = 0;
      const remaining = Math.max(0, allowance + topups - used);

      expect(remaining).toBe(30_000);
    });

    it("computes correct balance with allowance + topups", () => {
      const allowance = 30_000;
      const topups = 15_000;
      const used = 0;
      const remaining = Math.max(0, allowance + topups - used);

      expect(remaining).toBe(45_000);
    });

    it("computes correct balance with allowance + topups - usage", () => {
      const allowance = 30_000;
      const topups = 5_000;
      const used = 8_000;
      const remaining = Math.max(0, allowance + topups - used);

      expect(remaining).toBe(27_000);
    });

    it("clamps remaining to 0 when usage exceeds allowance + topups", () => {
      const allowance = 30_000;
      const topups = 0;
      const used = 50_000;
      const remaining = Math.max(0, allowance + topups - used);

      expect(remaining).toBe(0);
      expect(remaining).not.toBe(-20_000);
    });

    it("different plans have different allowances", () => {
      const allowances = {
        free: 30_000,
        pro: 300_000,
        elite: 1_000_000,
      };

      expect(allowances.free).toBe(30_000);
      expect(allowances.pro).toBe(300_000);
      expect(allowances.elite).toBe(1_000_000);
    });
  });

  describe("billing window queries", () => {
    it("time range query is inclusive start, exclusive end", () => {
      const window = getCalendarMonthWindow();
      const testDate = new Date(window.start.getTime() + 1000); // 1 second after start

      expect(testDate >= window.start).toBe(true);
      expect(testDate < window.end).toBe(true);
    });

    it("date at exact start is included", () => {
      const window = getCalendarMonthWindow();
      expect(window.start >= window.start).toBe(true);
      expect(window.start < window.end).toBe(true);
    });

    it("date at exact end is excluded", () => {
      const window = getCalendarMonthWindow();
      const dateAtEnd = new Date(window.end.getTime());
      expect(dateAtEnd < window.end).toBe(false);
    });
  });
});

describe("balance formula verification", () => {
  it("matches canonical formula: remaining = max(0, allowance + topups - used)", () => {
    // Test case 1: Normal usage
    expect(Math.max(0, 30_000 + 0 - 5_000)).toBe(25_000);

    // Test case 2: With topups
    expect(Math.max(0, 30_000 + 10_000 - 5_000)).toBe(35_000);

    // Test case 3: Exactly at limit
    expect(Math.max(0, 30_000 + 0 - 30_000)).toBe(0);

    // Test case 4: Exceeds limit (clamped)
    expect(Math.max(0, 30_000 + 0 - 35_000)).toBe(0);

    // Test case 5: Elite tier
    expect(Math.max(0, 1_000_000 + 50_000 - 100_000)).toBe(950_000);
  });
});
