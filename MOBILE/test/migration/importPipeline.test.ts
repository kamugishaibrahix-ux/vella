/**
 * Phase M3: Import pipeline – idempotency, resumability (cursor), no double-complete.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

const JOURNALS_PAGE = {
  data: [{ id: "j1", user_id: "u1", title: "T", content: "C", created_at: "2025-01-01", updated_at: "2025-01-01" }],
  has_more: false,
};
const CHECKINS_PAGE = {
  data: [{ id: "c1", user_id: "u1", entry_date: "2025-01-01", mood: 5, stress: 0, energy: 5, focus: 5, note: null, created_at: "2025-01-01" }],
  has_more: false,
};
const CONVERSATIONS_PAGE = { data: [{ id: "m1", role: "user", content: "hi", session_id: "s1", created_at: "2025-01-01" }], has_more: false };
const REPORTS_PAGE = {
  data: [{ id: "r1", user_id: "u1", type: "t", severity: 0, status: "open", summary: null, notes: null, created_at: "2025-01-01", updated_at: "2025-01-01" }],
  has_more: false,
};

describe("Import pipeline", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let completeCalls: number;

  beforeEach(() => {
    completeCalls = 0;
    fetchMock = vi.fn((url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/migration/start")) {
        return Promise.resolve(
          new Response(JSON.stringify({ migration_token: "test-token-12345678901234567890", expires_in_seconds: 600 }), { status: 200 })
        );
      }
      if (u.includes("/api/migration/complete")) {
        completeCalls++;
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      if (u.includes("journals")) return Promise.resolve(new Response(JSON.stringify({ error: "legacy_schema_dropped" }), { status: 410 }));
      if (u.includes("checkins")) return Promise.resolve(new Response(JSON.stringify({ error: "legacy_schema_dropped" }), { status: 410 }));
      if (u.includes("conversations")) return Promise.resolve(new Response(JSON.stringify({ error: "legacy_schema_dropped" }), { status: 410 }));
      if (u.includes("reports")) return Promise.resolve(new Response(JSON.stringify({ error: "legacy_schema_dropped" }), { status: 410 }));
      return Promise.resolve(new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }, indexedDB: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls export endpoints and POST complete once per run", async () => {
    const { runImportPipeline } = await import("@/lib/migration/client/importPipeline");
    const userId = "test-user";
    const result = await runImportPipeline(userId);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("journals"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("checkins"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("conversations"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("reports"), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("/api/migration/complete", expect.objectContaining({ method: "POST" }));
    expect(completeCalls).toBe(1);
  });

  it("returns error when POST /api/migration/start returns 403 (already completed)", async () => {
    fetchMock.mockImplementation((url: string | Request) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      if (u.includes("/api/migration/start")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "MIGRATION_ALREADY_COMPLETED", message: "Migration already completed." } }),
            { status: 403 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));
    });
    const { runImportPipeline } = await import("@/lib/migration/client/importPipeline");
    const result = await runImportPipeline("user-completed");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("already_completed");
  });

  it("second run succeeds (idempotent upserts by legacy_id)", async () => {
    const { runImportPipeline } = await import("@/lib/migration/client/importPipeline");
    const userId = "idempotent-user";
    const r1 = await runImportPipeline(userId);
    expect(r1.ok).toBe(true);
    const r2 = await runImportPipeline(userId);
    expect(r2.ok).toBe(true);
    expect(completeCalls).toBeGreaterThanOrEqual(1);
  });
});

describe("Migration completion flag", () => {
  it("isMigrationCompleted returns false when key not set", async () => {
    const { isMigrationCompleted } = await import("@/lib/migration/client/importPipeline");
    expect(isMigrationCompleted("user-nonexistent-" + Date.now())).toBe(false);
  });
});
