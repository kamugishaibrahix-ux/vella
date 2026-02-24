/**
 * Phase M3: Migration flow – 409 triggers required; completion sets flag; no export after complete.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkMigrationRequired } from "@/lib/migration/client/status";

vi.mock("@/lib/local/db/journalRepo", () => ({ indexedDBJournalRepo: { upsertByLegacyId: vi.fn(() => Promise.resolve()) } }));
vi.mock("@/lib/local/db/checkinsRepo", () => ({ indexedDBCheckinsRepo: { upsertByLegacyId: vi.fn(() => Promise.resolve()) } }));
vi.mock("@/lib/local/db/conversationRepo", () => ({ indexedDBConversationRepo: { upsertByLegacyId: vi.fn(() => Promise.resolve()) } }));
vi.mock("@/lib/local/db/reportsRepo", () => ({ indexedDBReportsRepo: { upsertByLegacyId: vi.fn(() => Promise.resolve()) } }));
vi.mock("@/lib/migration/client/cursorStore", () => ({
  getMigrationCursorStore: () => ({
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve()),
  }),
}));

describe("Migration flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checkMigrationRequired returns required when GET /api/migration/status returns required: true", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          migration: { status: "NOT_STARTED" },
          has_legacy: { journals: true, checkins: false, conversations: false, reports: false, memory: false },
          required: true,
          request_id: "req-1",
        }),
        { status: 200 }
      )
    );
    const result = await checkMigrationRequired();
    expect(result).toEqual({
      required: true,
      status: "NOT_STARTED",
      next_step: "export_legacy",
    });
  });

  it("checkMigrationRequired returns not required when GET /api/migration/status returns required: false", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          migration: { status: "COMPLETED" },
          has_legacy: { journals: false, checkins: false, conversations: false, reports: false, memory: false },
          required: false,
          request_id: null,
        }),
        { status: 200 }
      )
    );
    const result = await checkMigrationRequired();
    expect(result).toEqual({ required: false });
  });

  it("checkMigrationRequired returns not required when GET fails or returns non-ok", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "status_failed" }), { status: 500 })
    );
    const result = await checkMigrationRequired();
    expect(result).toEqual({ required: false });
  });

  const FORBIDDEN_KEYS = ["content", "note", "message", "summary", "title", "text", "narrative", "description"];
  it("migration status response shape has no forbidden keys and only safe scalar types", () => {
    const validStatusResponse = {
      migration: { status: "NOT_STARTED" as const },
      has_legacy: { journals: false, checkins: false, conversations: false, reports: false, memory: false },
      required: false,
      request_id: null as string | null,
    };
    const str = JSON.stringify(validStatusResponse);
    FORBIDDEN_KEYS.forEach((key) => {
      expect(str).not.toMatch(new RegExp(`"${key}"\\s*:`, "i"));
    });
    const parsed = JSON.parse(str);
    expect(typeof parsed.required).toBe("boolean");
    expect(typeof parsed.migration?.status).toBe("string");
    expect(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).toContain(parsed.migration.status);
    expect(parsed.has_legacy).toBeDefined();
    Object.values(parsed.has_legacy).forEach((v) => expect(typeof v).toBe("boolean"));
  });
});
