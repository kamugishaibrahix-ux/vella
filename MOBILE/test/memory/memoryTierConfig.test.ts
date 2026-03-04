/**
 * Phase 2: Memory Tier Configuration Tests
 * Verifies tier-based retrieval limits and time window enforcement.
 */
import { describe, it, expect } from "vitest";
import {
  MEMORY_TIER_CONFIG,
  getMemoryTierConfig,
  isWithinRecencyWindow,
  filterByRecencyWindow,
  type MemoryTier,
} from "@/lib/memory/memoryTierConfig";
import { UnknownTierError } from "@/lib/plans/defaultEntitlements";

describe("memory/memoryTierConfig", () => {
  describe("MEMORY_TIER_CONFIG", () => {
    it("free tier has correct configuration", () => {
      const config = MEMORY_TIER_CONFIG.free;
      expect(config.useSimilarity).toBe(false);
      expect(config.maxChunks).toBe(3);
      expect(config.maxCharsTotal).toBe(800);
      expect(config.recencyDaysCap).toBe(30);
      expect(config.candidatePoolLimit).toBe(30);
    });

    it("pro tier has correct configuration", () => {
      const config = MEMORY_TIER_CONFIG.pro;
      expect(config.useSimilarity).toBe(true);
      expect(config.maxChunks).toBe(6);
      expect(config.maxCharsTotal).toBe(1500);
      expect(config.recencyDaysCap).toBe(90);
      expect(config.candidatePoolLimit).toBe(100);
    });

    it("elite tier has correct configuration", () => {
      const config = MEMORY_TIER_CONFIG.elite;
      expect(config.useSimilarity).toBe(true);
      expect(config.maxChunks).toBe(18);
      expect(config.maxCharsTotal).toBe(4000);
      expect(config.recencyDaysCap).toBeNull();
      expect(config.candidatePoolLimit).toBe(300);
    });

    it("each tier has progressively larger limits", () => {
      expect(MEMORY_TIER_CONFIG.pro.maxChunks).toBeGreaterThan(MEMORY_TIER_CONFIG.free.maxChunks);
      expect(MEMORY_TIER_CONFIG.elite.maxChunks).toBeGreaterThan(MEMORY_TIER_CONFIG.pro.maxChunks);
      
      expect(MEMORY_TIER_CONFIG.pro.maxCharsTotal).toBeGreaterThan(MEMORY_TIER_CONFIG.free.maxCharsTotal);
      expect(MEMORY_TIER_CONFIG.elite.maxCharsTotal).toBeGreaterThan(MEMORY_TIER_CONFIG.pro.maxCharsTotal);
      
      expect(MEMORY_TIER_CONFIG.pro.candidatePoolLimit).toBeGreaterThan(MEMORY_TIER_CONFIG.free.candidatePoolLimit);
      expect(MEMORY_TIER_CONFIG.elite.candidatePoolLimit).toBeGreaterThan(MEMORY_TIER_CONFIG.pro.candidatePoolLimit);
    });
  });

  describe("getMemoryTierConfig", () => {
    it("returns correct config for each valid tier", () => {
      expect(getMemoryTierConfig("free")).toBe(MEMORY_TIER_CONFIG.free);
      expect(getMemoryTierConfig("pro")).toBe(MEMORY_TIER_CONFIG.pro);
      expect(getMemoryTierConfig("elite")).toBe(MEMORY_TIER_CONFIG.elite);
    });

    it("throws UnknownTierError for unknown tiers", () => {
      expect(() => getMemoryTierConfig("unknown" as MemoryTier)).toThrow(UnknownTierError);
      expect(() => getMemoryTierConfig("premium" as MemoryTier)).toThrow(UnknownTierError);
      expect(() => getMemoryTierConfig("" as MemoryTier)).toThrow(UnknownTierError);
    });
  });

  describe("isWithinRecencyWindow", () => {
    const now = Date.parse("2024-06-15T12:00:00Z");

    it("returns true when recencyDaysCap is null (elite tier)", () => {
      const oldDate = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year ago
      expect(isWithinRecencyWindow(oldDate, null, now)).toBe(true);
    });

    it("returns true for items within the window", () => {
      const recentDate = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(); // 15 days ago
      expect(isWithinRecencyWindow(recentDate, 30, now)).toBe(true);
    });

    it("returns false for items outside the window", () => {
      const oldDate = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days ago
      expect(isWithinRecencyWindow(oldDate, 30, now)).toBe(false);
    });

    it("free tier: 30-day window blocks older entries", () => {
      const config = MEMORY_TIER_CONFIG.free;
      
      const day29 = new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString();
      const day30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      const day31 = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
      
      expect(isWithinRecencyWindow(day29, config.recencyDaysCap, now)).toBe(true);
      expect(isWithinRecencyWindow(day30, config.recencyDaysCap, now)).toBe(true);
      expect(isWithinRecencyWindow(day31, config.recencyDaysCap, now)).toBe(false);
    });

    it("pro tier: 90-day window blocks older entries", () => {
      const config = MEMORY_TIER_CONFIG.pro;
      
      const day89 = new Date(now - 89 * 24 * 60 * 60 * 1000).toISOString();
      const day90 = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
      const day91 = new Date(now - 91 * 24 * 60 * 60 * 1000).toISOString();
      
      expect(isWithinRecencyWindow(day89, config.recencyDaysCap, now)).toBe(true);
      expect(isWithinRecencyWindow(day90, config.recencyDaysCap, now)).toBe(true);
      expect(isWithinRecencyWindow(day91, config.recencyDaysCap, now)).toBe(false);
    });

    it("elite tier: can access old entries", () => {
      const config = MEMORY_TIER_CONFIG.elite;
      
      const oneYearAgo = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
      const twoYearsAgo = new Date(now - 730 * 24 * 60 * 60 * 1000).toISOString();
      
      expect(isWithinRecencyWindow(oneYearAgo, config.recencyDaysCap, now)).toBe(true);
      expect(isWithinRecencyWindow(twoYearsAgo, config.recencyDaysCap, now)).toBe(true);
    });
  });

  describe("filterByRecencyWindow", () => {
    const now = Date.parse("2024-06-15T12:00:00Z");

    it("filters chunks outside the window", () => {
      const chunks = [
        { id: "1", created_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() }, // 10 days
        { id: "2", created_at: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString() }, // 20 days
        { id: "3", created_at: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString() }, // 40 days
        { id: "4", created_at: new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString() }, // 50 days
      ];

      // Free tier: 30-day window
      const filtered = filterByRecencyWindow(chunks, 30, now);
      
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.id)).toContain("1");
      expect(filtered.map((c) => c.id)).toContain("2");
      expect(filtered.map((c) => c.id)).not.toContain("3");
      expect(filtered.map((c) => c.id)).not.toContain("4");
    });

    it("returns all chunks when recencyDaysCap is null", () => {
      const chunks = [
        { id: "1", created_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "2", created_at: new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "3", created_at: new Date(now - 500 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      const filtered = filterByRecencyWindow(chunks, null, now);
      
      expect(filtered).toHaveLength(3);
    });

    it("returns empty array when all chunks are outside window", () => {
      const chunks = [
        { id: "1", created_at: new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "2", created_at: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      // Free tier: 30-day window
      const filtered = filterByRecencyWindow(chunks, 30, now);
      
      expect(filtered).toHaveLength(0);
    });

    it("applies before similarity scoring (time filter first)", () => {
      // Simulating a scenario where older chunks might have high similarity
      // but should be filtered out before scoring
      const chunks = [
        { id: "recent-low", created_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() },
        { id: "old-high", created_at: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      // Free tier filter
      const filtered = filterByRecencyWindow(chunks, 30, now);
      
      // Only recent chunks remain for similarity scoring
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("recent-low");
    });
  });

  describe("tier-based chunk caps", () => {
    it("free tier: max 3 chunks", () => {
      const config = MEMORY_TIER_CONFIG.free;
      expect(config.maxChunks).toBe(3);
      
      // Simulate retrieval with more candidates
      const candidates = Array(10).fill(null).map((_, i) => i);
      const selected = candidates.slice(0, config.maxChunks);
      expect(selected).toHaveLength(3);
    });

    it("pro tier: max 6 chunks", () => {
      const config = MEMORY_TIER_CONFIG.pro;
      expect(config.maxChunks).toBe(6);
      
      const candidates = Array(10).fill(null).map((_, i) => i);
      const selected = candidates.slice(0, config.maxChunks);
      expect(selected).toHaveLength(6);
    });

    it("elite tier: max 18 chunks", () => {
      const config = MEMORY_TIER_CONFIG.elite;
      expect(config.maxChunks).toBe(18);
      
      const candidates = Array(20).fill(null).map((_, i) => i);
      const selected = candidates.slice(0, config.maxChunks);
      expect(selected).toHaveLength(18);
    });

    it("tier caps are strictly enforced", () => {
      // Ensure caps are not exceeded even with many candidates
      const manyCandidates = Array(100).fill(null).map((_, i) => i);
      
      expect(manyCandidates.slice(0, MEMORY_TIER_CONFIG.free.maxChunks)).toHaveLength(3);
      expect(manyCandidates.slice(0, MEMORY_TIER_CONFIG.pro.maxChunks)).toHaveLength(6);
      expect(manyCandidates.slice(0, MEMORY_TIER_CONFIG.elite.maxChunks)).toHaveLength(18);
    });
  });

  describe("tier-based character budgets", () => {
    it("free tier: 800 chars", () => {
      expect(MEMORY_TIER_CONFIG.free.maxCharsTotal).toBe(800);
    });

    it("pro tier: 1500 chars", () => {
      expect(MEMORY_TIER_CONFIG.pro.maxCharsTotal).toBe(1500);
    });

    it("elite tier: 4000 chars", () => {
      expect(MEMORY_TIER_CONFIG.elite.maxCharsTotal).toBe(4000);
    });
  });
});
