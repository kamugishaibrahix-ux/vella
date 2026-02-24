import { describe, it, expect, beforeEach } from "vitest";
import {
  saveLocalTraits,
  loadLocalTraits,
  loadLocalTraitHistory,
  appendLocalTraitHistory,
  type LocalTraitsSnapshot,
  type LocalTraitHistoryEntry,
} from "@/lib/local/traitsLocal";
import type { TraitScores } from "@/lib/traits/adaptiveTraits";

const TEST_USER_ID = "test-user-123";

function createTestTraitScores(overrides?: Partial<TraitScores>): TraitScores {
  return {
    resilience: 50,
    clarity: 50,
    discipline: 50,
    emotional_stability: 50,
    motivation: 50,
    self_compassion: 50,
    ...overrides,
  };
}

function createTestSnapshot(
  userId: string,
  scores?: Partial<TraitScores>,
  daysAgo = 0,
): LocalTraitsSnapshot {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const iso = date.toISOString();
  return {
    userId,
    scores: createTestTraitScores(scores),
    lastComputedAt: iso,
    updatedAt: iso,
  };
}

function createTestHistoryEntry(
  userId: string,
  scores?: Partial<TraitScores>,
  daysAgo = 0,
): LocalTraitHistoryEntry {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const windowEnd = date.toISOString();
  const windowStart = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: `${userId}-${windowEnd}-${Math.random().toString(36).substring(2, 15)}`,
    userId,
    windowStart,
    windowEnd,
    scores: createTestTraitScores(scores),
    createdAt: windowEnd,
  };
}

describe("traitsLocal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("saveLocalTraits and loadLocalTraits", () => {
    it("should save and load a traits snapshot", () => {
      const snapshot = createTestSnapshot(TEST_USER_ID);
      saveLocalTraits(TEST_USER_ID, snapshot);

      const loaded = loadLocalTraits(TEST_USER_ID);
      expect(loaded).not.toBeNull();
      expect(loaded?.userId).toBe(TEST_USER_ID);
      expect(loaded?.scores).toEqual(snapshot.scores);
      expect(loaded?.lastComputedAt).toBe(snapshot.lastComputedAt);
      expect(loaded?.updatedAt).toBe(snapshot.updatedAt);
    });

    it("should update existing snapshot when saving again", () => {
      const snapshot1 = createTestSnapshot(TEST_USER_ID, { resilience: 60 });
      saveLocalTraits(TEST_USER_ID, snapshot1);

      const snapshot2 = createTestSnapshot(TEST_USER_ID, { resilience: 70 });
      saveLocalTraits(TEST_USER_ID, snapshot2);

      const loaded = loadLocalTraits(TEST_USER_ID);
      expect(loaded?.scores.resilience).toBe(70);
    });

    it("should return null when no snapshot exists", () => {
      expect(loadLocalTraits(TEST_USER_ID)).toBeNull();
    });

    it("should handle undefined userId by using anonymous ID", () => {
      const snapshot = createTestSnapshot("anonymous-id");
      saveLocalTraits(undefined, snapshot);

      const loaded = loadLocalTraits(undefined);
      expect(loaded).not.toBeNull();
      expect(loaded?.scores).toEqual(snapshot.scores);
    });

    it("should isolate snapshots by userId", () => {
      const snapshot1 = createTestSnapshot("user-a", { resilience: 60 });
      const snapshot2 = createTestSnapshot("user-b", { resilience: 80 });

      saveLocalTraits("user-a", snapshot1);
      saveLocalTraits("user-b", snapshot2);

      expect(loadLocalTraits("user-a")?.scores.resilience).toBe(60);
      expect(loadLocalTraits("user-b")?.scores.resilience).toBe(80);
    });

    it("should preserve all trait scores correctly", () => {
      const scores = {
        resilience: 75,
        clarity: 65,
        discipline: 55,
        emotional_stability: 85,
        motivation: 70,
        self_compassion: 80,
      };
      const snapshot = createTestSnapshot(TEST_USER_ID, scores);
      saveLocalTraits(TEST_USER_ID, snapshot);

      const loaded = loadLocalTraits(TEST_USER_ID);
      expect(loaded?.scores).toEqual(scores);
    });
  });

  describe("loadLocalTraitHistory and appendLocalTraitHistory", () => {
    it("should return empty array when no history exists", () => {
      expect(loadLocalTraitHistory(TEST_USER_ID)).toEqual([]);
    });

    it("should append and load a single history entry", () => {
      const entry = createTestHistoryEntry(TEST_USER_ID);
      appendLocalTraitHistory(TEST_USER_ID, entry);

      const history = loadLocalTraitHistory(TEST_USER_ID);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(entry);
    });

    it("should append multiple entries and maintain sort order (newest first)", () => {
      const entry1 = createTestHistoryEntry(TEST_USER_ID, {}, 2);
      const entry2 = createTestHistoryEntry(TEST_USER_ID, {}, 0);
      const entry3 = createTestHistoryEntry(TEST_USER_ID, {}, 1);

      appendLocalTraitHistory(TEST_USER_ID, entry1);
      appendLocalTraitHistory(TEST_USER_ID, entry2);
      appendLocalTraitHistory(TEST_USER_ID, entry3);

      const history = loadLocalTraitHistory(TEST_USER_ID);
      expect(history).toHaveLength(3);
      // Should be sorted by createdAt descending (newest first)
      expect(history[0].id).toBe(entry2.id);
      expect(history[1].id).toBe(entry3.id);
      expect(history[2].id).toBe(entry1.id);
    });

    it("should maintain sort order after multiple appends", () => {
      const entries = [];
      for (let i = 0; i < 10; i++) {
        entries.push(createTestHistoryEntry(TEST_USER_ID, {}, i));
      }

      // Append in reverse order to test sorting
      for (let i = entries.length - 1; i >= 0; i--) {
        appendLocalTraitHistory(TEST_USER_ID, entries[i]);
      }

      const history = loadLocalTraitHistory(TEST_USER_ID);
      expect(history).toHaveLength(10);
      // Verify descending order by createdAt
      for (let i = 0; i < history.length - 1; i++) {
        const current = new Date(history[i].createdAt).getTime();
        const next = new Date(history[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it("should isolate history by userId", () => {
      const entry1 = createTestHistoryEntry("user-a");
      const entry2 = createTestHistoryEntry("user-b");

      appendLocalTraitHistory("user-a", entry1);
      appendLocalTraitHistory("user-b", entry2);

      expect(loadLocalTraitHistory("user-a")).toHaveLength(1);
      expect(loadLocalTraitHistory("user-a")[0].userId).toBe("user-a");
      expect(loadLocalTraitHistory("user-b")).toHaveLength(1);
      expect(loadLocalTraitHistory("user-b")[0].userId).toBe("user-b");
    });

    it("should preserve all fields in history entry", () => {
      const entry = createTestHistoryEntry(TEST_USER_ID, { resilience: 75 });
      appendLocalTraitHistory(TEST_USER_ID, entry);

      const history = loadLocalTraitHistory(TEST_USER_ID);
      expect(history[0]).toEqual(entry);
      expect(history[0].scores.resilience).toBe(75);
      expect(history[0].windowStart).toBeDefined();
      expect(history[0].windowEnd).toBeDefined();
      expect(history[0].createdAt).toBeDefined();
    });

    it("should handle undefined userId for history", () => {
      const entry = createTestHistoryEntry("anonymous-id");
      appendLocalTraitHistory(undefined, entry);

      const history = loadLocalTraitHistory(undefined);
      expect(history).toHaveLength(1);
    });
  });

  describe("integration: snapshot and history", () => {
    it("should maintain separate snapshot and history", () => {
      const snapshot = createTestSnapshot(TEST_USER_ID, { resilience: 60 });
      const entry = createTestHistoryEntry(TEST_USER_ID, { resilience: 70 });

      saveLocalTraits(TEST_USER_ID, snapshot);
      appendLocalTraitHistory(TEST_USER_ID, entry);

      const loadedSnapshot = loadLocalTraits(TEST_USER_ID);
      const history = loadLocalTraitHistory(TEST_USER_ID);

      expect(loadedSnapshot?.scores.resilience).toBe(60);
      expect(history).toHaveLength(1);
      expect(history[0].scores.resilience).toBe(70);
    });

    it("should allow multiple history entries with different scores", () => {
      const entry1 = createTestHistoryEntry(TEST_USER_ID, { resilience: 50 }, 30);
      const entry2 = createTestHistoryEntry(TEST_USER_ID, { resilience: 60 }, 20);
      const entry3 = createTestHistoryEntry(TEST_USER_ID, { resilience: 70 }, 10);

      appendLocalTraitHistory(TEST_USER_ID, entry1);
      appendLocalTraitHistory(TEST_USER_ID, entry2);
      appendLocalTraitHistory(TEST_USER_ID, entry3);

      const history = loadLocalTraitHistory(TEST_USER_ID);
      expect(history).toHaveLength(3);
      expect(history[0].scores.resilience).toBe(70);
      expect(history[1].scores.resilience).toBe(60);
      expect(history[2].scores.resilience).toBe(50);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string userId", () => {
      const snapshot = createTestSnapshot("anonymous-id");
      saveLocalTraits("", snapshot);
      const loaded = loadLocalTraits("");
      expect(loaded).not.toBeNull();
    });

    it("should handle very large number of history entries", () => {
      const count = 100;
      for (let i = 0; i < count; i++) {
        appendLocalTraitHistory(TEST_USER_ID, createTestHistoryEntry(TEST_USER_ID, {}, i));
      }

      const history = loadLocalTraitHistory(TEST_USER_ID);
      expect(history).toHaveLength(count);
      // Verify sorting is maintained
      for (let i = 0; i < history.length - 1; i++) {
        const current = new Date(history[i].createdAt).getTime();
        const next = new Date(history[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it("should handle trait scores at boundaries (0 and 100)", () => {
      const minScores = createTestSnapshot(TEST_USER_ID, {
        resilience: 0,
        clarity: 0,
        discipline: 0,
        emotional_stability: 0,
        motivation: 0,
        self_compassion: 0,
      });
      const maxScores = createTestSnapshot(TEST_USER_ID, {
        resilience: 100,
        clarity: 100,
        discipline: 100,
        emotional_stability: 100,
        motivation: 100,
        self_compassion: 100,
      });

      saveLocalTraits(TEST_USER_ID, minScores);
      expect(loadLocalTraits(TEST_USER_ID)?.scores.resilience).toBe(0);

      saveLocalTraits(TEST_USER_ID, maxScores);
      expect(loadLocalTraits(TEST_USER_ID)?.scores.resilience).toBe(100);
    });

    it("should handle duplicate history entries (same ID)", () => {
      const entry = createTestHistoryEntry(TEST_USER_ID);
      appendLocalTraitHistory(TEST_USER_ID, entry);
      appendLocalTraitHistory(TEST_USER_ID, entry); // Same entry again

      const history = loadLocalTraitHistory(TEST_USER_ID);
      // Should allow duplicates (real-world scenario: recomputation)
      expect(history.length).toBeGreaterThanOrEqual(1);
    });

    it("should preserve windowStart and windowEnd correctly", () => {
      const entry = createTestHistoryEntry(TEST_USER_ID);
      const windowStartTime = new Date(entry.windowStart).getTime();
      const windowEndTime = new Date(entry.windowEnd).getTime();

      appendLocalTraitHistory(TEST_USER_ID, entry);

      const history = loadLocalTraitHistory(TEST_USER_ID);
      const loadedStart = new Date(history[0].windowStart).getTime();
      const loadedEnd = new Date(history[0].windowEnd).getTime();

      expect(loadedStart).toBe(windowStartTime);
      expect(loadedEnd).toBe(windowEndTime);
      // Window should be approximately 30 days
      const windowDays = (windowEndTime - windowStartTime) / (24 * 60 * 60 * 1000);
      expect(windowDays).toBeCloseTo(30, 0);
    });
  });
});

