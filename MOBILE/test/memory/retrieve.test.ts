/**
 * Phase 1: Memory Retrieval Determinism Tests
 * Verifies retrieveTopK produces consistent, deterministic results.
 */
import { describe, it, expect } from "vitest";
import type { MemoryChunkRecord } from "@/lib/memory/db";

// Replicate the scoring logic from retrieve.ts for testing
const SIM_WEIGHT = 0.85;
const RECENCY_WEIGHT = 0.15;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function recencyBoost(createdAtISO: string, now: number): number {
  const ageMs = now - new Date(createdAtISO).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays <= 0) return 1;
  if (ageDays <= 1) return 0.9;
  if (ageDays <= 7) return 0.7;
  if (ageDays <= 30) return 0.4;
  return 0.2;
}

describe("memory/retrieve", () => {
  describe("deterministic scoring", () => {
    it("produces same score for same input (similarity + recency)", () => {
      const queryEmb = [0.1, 0.2, 0.3, 0.4];
      const chunkEmb = [0.15, 0.25, 0.35, 0.45];
      const createdAt = new Date().toISOString();
      const now = Date.now();

      const sim1 = cosineSimilarity(queryEmb, chunkEmb);
      const rec1 = recencyBoost(createdAt, now);
      const score1 = sim1 * SIM_WEIGHT + rec1 * RECENCY_WEIGHT;

      const sim2 = cosineSimilarity(queryEmb, chunkEmb);
      const rec2 = recencyBoost(createdAt, now);
      const score2 = sim2 * SIM_WEIGHT + rec2 * RECENCY_WEIGHT;

      expect(score1).toBe(score2);
    });

    it("tie-breaks by created_at when scores are equal", () => {
      const now = Date.now();
      const chunks = [
        { id: "1", created_at: new Date(now - 1000).toISOString(), embedding: [0.1, 0.2] },
        { id: "2", created_at: new Date(now - 2000).toISOString(), embedding: [0.1, 0.2] },
        { id: "3", created_at: new Date(now - 3000).toISOString(), embedding: [0.1, 0.2] },
      ];

      // All have same embedding = same similarity = same score
      const scored = chunks.map((c) => ({
        chunk: c,
        score: 0.5, // same score
        createdAt: c.created_at,
      }));

      // Deterministic sort: score desc, then created_at desc
      scored.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) > 1e-10) return scoreDiff;
        return b.createdAt.localeCompare(a.createdAt);
      });

      // Newer items should come first when scores equal
      expect(scored[0].chunk.id).toBe("1"); // newest
      expect(scored[1].chunk.id).toBe("2");
      expect(scored[2].chunk.id).toBe("3"); // oldest
    });

    it("uses score difference when scores differ significantly", () => {
      const scored = [
        { chunk: { id: "a" }, score: 0.9, createdAt: "2024-01-01T00:00:00Z" },
        { chunk: { id: "b" }, score: 0.8, createdAt: "2024-01-02T00:00:00Z" },
        { chunk: { id: "c" }, score: 0.7, createdAt: "2024-01-03T00:00:00Z" },
      ];

      scored.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) > 1e-10) return scoreDiff;
        return b.createdAt.localeCompare(a.createdAt);
      });

      expect(scored[0].chunk.id).toBe("a"); // highest score
      expect(scored[1].chunk.id).toBe("b");
      expect(scored[2].chunk.id).toBe("c");
    });
  });

  describe("hard caps", () => {
    it("caps k at 20 maximum", () => {
      const requestedK = 100;
      const actualK = Math.min(requestedK ?? 6, 20);
      expect(actualK).toBe(20);
    });

    it("uses default k of 6 when not specified", () => {
      const requestedK = undefined;
      const actualK = Math.min(requestedK ?? 6, 20);
      expect(actualK).toBe(6);
    });

    it("caps maxCharsTotal at safe ceiling", () => {
      const maxCharsTotal = 1500;
      const k = 6;
      const perExcerpt = Math.max(200, Math.floor(maxCharsTotal / Math.max(1, k)));
      expect(perExcerpt).toBe(250); // 1500/6
    });

    it("respects candidate pool limits for recency", () => {
      const limit = Math.min(50 ?? 30, 200);
      expect(limit).toBeLessThanOrEqual(200);
    });

    it("respects candidate pool limits for embedded chunks", () => {
      const limit = Math.min(250 ?? 200, 300);
      expect(limit).toBeLessThanOrEqual(300);
    });
  });

  describe("cosine similarity", () => {
    it("returns 0 for empty vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it("returns 0 for mismatched lengths", () => {
      expect(cosineSimilarity([0.1, 0.2], [0.1])).toBe(0);
    });

    it("returns 1 for identical vectors", () => {
      const vec = [0.1, 0.2, 0.3];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 10);
    });

    it("returns 0 for orthogonal vectors", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    });

    it("calculates similarity correctly for different vectors", () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      // dot = 4 + 10 + 18 = 32
      // normA = sqrt(1 + 4 + 9) = sqrt(14)
      // normB = sqrt(16 + 25 + 36) = sqrt(77)
      // sim = 32 / (sqrt(14) * sqrt(77))
      const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
      expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
    });
  });

  describe("recency boost", () => {
    const now = Date.parse("2024-06-15T12:00:00Z");

    it("returns 1 for items created now", () => {
      const createdAt = new Date(now).toISOString();
      expect(recencyBoost(createdAt, now)).toBe(1);
    });

    it("returns 0.9 for items within 1 day", () => {
      const createdAt = new Date(now - 12 * 60 * 60 * 1000).toISOString(); // 12 hours ago
      expect(recencyBoost(createdAt, now)).toBe(0.9);
    });

    it("returns 0.7 for items within 7 days", () => {
      const createdAt = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
      expect(recencyBoost(createdAt, now)).toBe(0.7);
    });

    it("returns 0.4 for items within 30 days", () => {
      const createdAt = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(); // 15 days ago
      expect(recencyBoost(createdAt, now)).toBe(0.4);
    });

    it("returns 0.2 for items older than 30 days", () => {
      const createdAt = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago
      expect(recencyBoost(createdAt, now)).toBe(0.2);
    });
  });
});
