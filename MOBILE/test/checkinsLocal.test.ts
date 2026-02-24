import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveCheckin,
  loadCheckins,
  deleteCheckin,
  saveCheckinNote,
  loadCheckinNotes,
  type LocalCheckin,
  type LocalCheckinNote,
} from "@/lib/local/checkinsLocal";

const TEST_USER_ID = "test-user-123";

// In-memory store for repo mock (cleared in beforeEach)
const store = new Map<
  string,
  {
    userId: string;
    legacy_id: string;
    entry_date: string;
    mood: number;
    stress: number;
    energy: number;
    focus: number;
    note: string | null;
    created_at: string;
  }
>();

vi.mock("@/lib/local/ensureUserId", () => ({
  ensureUserId: (userId: string | undefined | null) =>
    userId === undefined || userId === "" ? "test-user-123" : userId,
}));

vi.mock("@/lib/local/db/checkinsRepo", () => ({
  indexedDBCheckinsRepo: {
    list: async (userId: string) => {
      const rows = Array.from(store.values())
        .filter((r) => r.userId === userId)
        .map((r) => ({
          legacy_id: r.legacy_id,
          entry_date: r.entry_date,
          mood: r.mood,
          stress: r.stress,
          energy: r.energy,
          focus: r.focus,
          note: r.note,
          created_at: r.created_at,
        }));
      return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    get: async (userId: string, legacyId: string) => {
      const r = store.get(`${userId}:${legacyId}`);
      return r
        ? {
            legacy_id: r.legacy_id,
            entry_date: r.entry_date,
            mood: r.mood,
            stress: r.stress,
            energy: r.energy,
            focus: r.focus,
            note: r.note,
            created_at: r.created_at,
          }
        : null;
    },
    upsertByLegacyId: async (
      userId: string,
      row: {
        legacy_id: string;
        entry_date: string;
        mood: number;
        stress: number;
        energy: number;
        focus: number;
        note: string | null;
        created_at: string;
      }
    ) => {
      store.set(`${userId}:${row.legacy_id}`, { ...row, userId });
    },
    delete: async (userId: string, legacyId: string) => {
      store.delete(`${userId}:${legacyId}`);
    },
  },
}));

// Ensure checkinsLocal sees indexedDB so it uses the repo; keep window.localStorage for ensureUserId
beforeEach(() => {
  store.clear();
  const w = globalThis as unknown as { window: { indexedDB?: unknown; localStorage?: Storage } };
  if (w.window) {
    w.window.indexedDB = {};
  }
});

function createTestCheckin(id: string, daysAgo = 0): LocalCheckin {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id,
    entry_date: date.toISOString().slice(0, 10),
    mood: 7,
    stress: 3,
    energy: 6,
    focus: 5,
    created_at: date.toISOString(),
  };
}

describe("checkinsLocal", () => {
  describe("saveCheckin and loadCheckins", () => {
    it("should save and load a single checkin", async () => {
      const checkin = createTestCheckin("checkin-1");
      await saveCheckin(TEST_USER_ID, checkin);

      const loaded = await loadCheckins(TEST_USER_ID);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toMatchObject({
        id: checkin.id,
        entry_date: checkin.entry_date,
        mood: checkin.mood,
        stress: checkin.stress,
        energy: checkin.energy,
        focus: checkin.focus,
        created_at: checkin.created_at,
      });
      expect(loaded[0].note).toBeNull();
    });

    it("should save multiple checkins and maintain sort order (newest first)", async () => {
      const checkin1 = createTestCheckin("checkin-1", 2);
      const checkin2 = createTestCheckin("checkin-2", 0);
      const checkin3 = createTestCheckin("checkin-3", 1);

      await saveCheckin(TEST_USER_ID, checkin1);
      await saveCheckin(TEST_USER_ID, checkin2);
      await saveCheckin(TEST_USER_ID, checkin3);

      const loaded = await loadCheckins(TEST_USER_ID);
      expect(loaded).toHaveLength(3);
      expect(loaded[0].id).toBe("checkin-2");
      expect(loaded[1].id).toBe("checkin-3");
      expect(loaded[2].id).toBe("checkin-1");
    });

    it("should update existing checkin when saving with same ID", async () => {
      const checkin1 = createTestCheckin("checkin-1");
      await saveCheckin(TEST_USER_ID, checkin1);

      const updated = { ...checkin1, mood: 9, stress: 1 };
      await saveCheckin(TEST_USER_ID, updated);

      const loaded = await loadCheckins(TEST_USER_ID);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].mood).toBe(9);
      expect(loaded[0].stress).toBe(1);
    });

    it("should handle undefined userId by using anonymous ID", async () => {
      const checkin = createTestCheckin("checkin-1");
      await saveCheckin(undefined, checkin);

      const loaded = await loadCheckins(undefined);
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toMatchObject({
        id: checkin.id,
        entry_date: checkin.entry_date,
        mood: checkin.mood,
        stress: checkin.stress,
        energy: checkin.energy,
        focus: checkin.focus,
        created_at: checkin.created_at,
      });
      expect(loaded[0].note).toBeNull();
    });

    it("should isolate checkins by userId", async () => {
      const checkin1 = createTestCheckin("checkin-1");
      const checkin2 = createTestCheckin("checkin-2");

      await saveCheckin("user-a", checkin1);
      await saveCheckin("user-b", checkin2);

      const loadA = await loadCheckins("user-a");
      const loadB = await loadCheckins("user-b");
      expect(loadA).toHaveLength(1);
      expect(loadA[0].id).toBe("checkin-1");
      expect(loadB).toHaveLength(1);
      expect(loadB[0].id).toBe("checkin-2");
    });

    it("should return empty array when no checkins exist", async () => {
      const loaded = await loadCheckins(TEST_USER_ID);
      expect(loaded).toEqual([]);
    });
  });

  describe("saveCheckinNote and loadCheckinNotes", () => {
    it("should save and load a checkin note", async () => {
      await saveCheckinNote(TEST_USER_ID, "checkin-1", "Feeling great today!");
      const notes = await loadCheckinNotes(TEST_USER_ID);

      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe("checkin-1");
      expect(notes[0].note).toBe("Feeling great today!");
      expect(notes[0].createdAt).toBeDefined();
    });

    it("should update existing note when saving with same checkin ID", async () => {
      await saveCheckinNote(TEST_USER_ID, "checkin-1", "First note");
      await saveCheckinNote(TEST_USER_ID, "checkin-1", "Updated note");

      const notes = await loadCheckinNotes(TEST_USER_ID);
      expect(notes).toHaveLength(1);
      expect(notes[0].note).toBe("Updated note");
    });

    it("should save multiple notes for different checkins", async () => {
      await saveCheckinNote(TEST_USER_ID, "checkin-1", "Note 1");
      await saveCheckinNote(TEST_USER_ID, "checkin-2", "Note 2");
      await saveCheckinNote(TEST_USER_ID, "checkin-3", "Note 3");

      const notes = await loadCheckinNotes(TEST_USER_ID);
      expect(notes).toHaveLength(3);
      expect(notes.map((n) => n.id).sort()).toEqual(["checkin-1", "checkin-2", "checkin-3"]);
    });

    it("should isolate notes by userId", async () => {
      await saveCheckinNote("user-a", "checkin-1", "User A note");
      await saveCheckinNote("user-b", "checkin-1", "User B note");

      const notesA = await loadCheckinNotes("user-a");
      const notesB = await loadCheckinNotes("user-b");
      expect(notesA).toHaveLength(1);
      expect(notesA[0].note).toBe("User A note");
      expect(notesB).toHaveLength(1);
      expect(notesB[0].note).toBe("User B note");
    });

    it("should return empty array when no notes exist", async () => {
      const notes = await loadCheckinNotes(TEST_USER_ID);
      expect(notes).toEqual([]);
    });
  });

  describe("deleteCheckin", () => {
    it("should delete a checkin and its associated note", async () => {
      const checkin = createTestCheckin("checkin-1");
      await saveCheckin(TEST_USER_ID, checkin);
      await saveCheckinNote(TEST_USER_ID, "checkin-1", "Test note");

      await deleteCheckin(TEST_USER_ID, "checkin-1");

      const checkins = await loadCheckins(TEST_USER_ID);
      const notes = await loadCheckinNotes(TEST_USER_ID);
      expect(checkins).toHaveLength(0);
      expect(notes).toHaveLength(0);
    });

    it("should only delete the specified checkin", async () => {
      const checkin1 = createTestCheckin("checkin-1");
      const checkin2 = createTestCheckin("checkin-2");
      await saveCheckin(TEST_USER_ID, checkin1);
      await saveCheckin(TEST_USER_ID, checkin2);
      await saveCheckinNote(TEST_USER_ID, "checkin-1", "Note 1");
      await saveCheckinNote(TEST_USER_ID, "checkin-2", "Note 2");

      await deleteCheckin(TEST_USER_ID, "checkin-1");

      const checkins = await loadCheckins(TEST_USER_ID);
      const notes = await loadCheckinNotes(TEST_USER_ID);

      expect(checkins).toHaveLength(1);
      expect(checkins[0].id).toBe("checkin-2");
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe("checkin-2");
    });

    it("should handle deleting non-existent checkin gracefully", async () => {
      await expect(deleteCheckin(TEST_USER_ID, "non-existent")).resolves.not.toThrow();

      const loaded = await loadCheckins(TEST_USER_ID);
      expect(loaded).toEqual([]);
    });

    it("should not affect other users' checkins when deleting", async () => {
      const checkin1 = createTestCheckin("checkin-1");
      const checkin2 = createTestCheckin("checkin-2");

      await saveCheckin("user-a", checkin1);
      await saveCheckin("user-b", checkin2);

      await deleteCheckin("user-a", "checkin-1");

      const loadA = await loadCheckins("user-a");
      const loadB = await loadCheckins("user-b");
      expect(loadA).toHaveLength(0);
      expect(loadB).toHaveLength(1);
      expect(loadB[0].id).toBe("checkin-2");
    });
  });

  describe("integration: checkins with notes", () => {
    it("should maintain consistency between checkins and notes", async () => {
      const checkin1 = createTestCheckin("checkin-1");
      const checkin2 = createTestCheckin("checkin-2");

      await saveCheckin(TEST_USER_ID, checkin1);
      await saveCheckin(TEST_USER_ID, checkin2);
      await saveCheckinNote(TEST_USER_ID, "checkin-1", "Note for checkin 1");

      const checkins = await loadCheckins(TEST_USER_ID);
      const notes = await loadCheckinNotes(TEST_USER_ID);

      expect(checkins).toHaveLength(2);
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe("checkin-1");
    });

    it("should handle checkin deletion when note exists but checkin doesn't", async () => {
      await saveCheckinNote(TEST_USER_ID, "orphaned-checkin", "Orphaned note");

      await deleteCheckin(TEST_USER_ID, "orphaned-checkin");
      const notes = await loadCheckinNotes(TEST_USER_ID);
      expect(notes).toHaveLength(0);
    });

    it("should handle checkin without note", async () => {
      const checkin = createTestCheckin("checkin-1");
      await saveCheckin(TEST_USER_ID, checkin);

      const checkins = await loadCheckins(TEST_USER_ID);
      const notes = await loadCheckinNotes(TEST_USER_ID);

      expect(checkins).toHaveLength(1);
      expect(notes).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string userId", async () => {
      const checkin = createTestCheckin("checkin-1");
      await saveCheckin("", checkin);
      const loaded = await loadCheckins("");
      expect(loaded).toHaveLength(1);
    });

    it("should handle very large number of checkins", async () => {
      const count = 100;
      for (let i = 0; i < count; i++) {
        await saveCheckin(TEST_USER_ID, createTestCheckin(`checkin-${i}`, i));
      }

      const loaded = await loadCheckins(TEST_USER_ID);
      expect(loaded).toHaveLength(count);
      for (let i = 0; i < loaded.length - 1; i++) {
        const current = new Date(loaded[i].created_at).getTime();
        const next = new Date(loaded[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it("should handle special characters in note text", async () => {
      const specialNote = "Note with special chars: <>&\"' and emoji 🎉";
      await saveCheckinNote(TEST_USER_ID, "checkin-1", specialNote);

      const notes = await loadCheckinNotes(TEST_USER_ID);
      expect(notes[0].note).toBe(specialNote);
    });

    it("should handle very long note text", async () => {
      const longNote = "A".repeat(10000);
      await saveCheckinNote(TEST_USER_ID, "checkin-1", longNote);

      const notes = await loadCheckinNotes(TEST_USER_ID);
      expect(notes[0].note).toBe(longNote);
      expect(notes[0].note.length).toBe(10000);
    });
  });
});
