/**
 * Phase M4: Purge route gating and no-forbidden-keys.
 * - Purge when migration_state != COMPLETED returns 403 with MIGRATION_NOT_COMPLETED
 * - Success response contains no forbidden keys and only safe scalar types
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/internal/migration/purge/route";
import { supabaseAdmin } from "@/lib/supabase/admin";

const FORBIDDEN_KEYS = ["content", "note", "message", "summary", "title", "text", "narrative", "description"] as const;
const MAX_SAFE_STRING_LENGTH = 128;

function collectKeys(obj: unknown, prefix = ""): string[] {
  if (obj == null || typeof obj !== "object") return [];
  const keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    keys.push(path);
    const v = (obj as Record<string, unknown>)[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    }
  }
  return keys;
}

function isSafeValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "number" && Number.isFinite(value)) return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= MAX_SAFE_STRING_LENGTH;
  if (Array.isArray(value)) return value.every(isSafeValue);
  if (typeof value === "object") return Object.values(value).every(isSafeValue);
  return false;
}

const testUserId = "00000000-0000-0000-0000-000000000001";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

describe("Migration purge route", () => {
  const cronSecret = "test-purge-cron-secret";

  beforeEach(() => {
    process.env.MIGRATION_PURGE_CRON_SECRET = cronSecret;
    vi.mocked(supabaseAdmin!.rpc).mockReset();
  });

  it("returns 401 without cron secret", async () => {
    const req = new Request("http://localhost/api/internal/migration/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: testUserId }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body missing user_id", async () => {
    vi.mocked(supabaseAdmin!.rpc).mockResolvedValue({ data: null, error: null });
    const req = new Request("http://localhost/api/internal/migration/purge", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing user_id");
  });

  it("returns 403 with MIGRATION_NOT_COMPLETED when migration not completed", async () => {
    vi.mocked(supabaseAdmin!.rpc).mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "MIGRATION_NOT_COMPLETED" },
    });
    const req = new Request("http://localhost/api/internal/migration/purge", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: testUserId }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("MIGRATION_NOT_COMPLETED");
    expect(body.request_id).toBeDefined();
  });

  it("returns 403 when RPC error message contains MIGRATION_NOT_COMPLETED", async () => {
    vi.mocked(supabaseAdmin!.rpc).mockResolvedValue({
      data: null,
      error: { message: "MIGRATION_NOT_COMPLETED" },
    });
    const req = new Request("http://localhost/api/internal/migration/purge", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: testUserId }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("MIGRATION_NOT_COMPLETED");
  });

  it("returns 200 on success and response has no forbidden keys", async () => {
    vi.mocked(supabaseAdmin!.rpc).mockResolvedValue({
      data: {
        user_id: testUserId,
        status: "PURGED",
        tables: {
          journal_entries: { updated_rows: 2 },
          conversation_messages: { updated_rows: 0 },
          check_ins: { updated_rows: 1 },
          memory_chunks: { updated_rows: 0 },
          user_reports: { updated_rows: 0 },
          user_nudges: { updated_rows: 0 },
        },
        totals: { total_updated_rows: 3 },
      },
      error: null,
    });
    const req = new Request("http://localhost/api/internal/migration/purge", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: testUserId }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const allKeys = collectKeys(body);
    for (const forbidden of FORBIDDEN_KEYS) {
      const hasForbidden = allKeys.some((k) => k === forbidden || k.endsWith(`.${forbidden}`));
      expect(hasForbidden, `Response must not contain key "${forbidden}"`).toBe(false);
    }
  });

  it("success response values are only safe scalar types", async () => {
    vi.mocked(supabaseAdmin!.rpc).mockResolvedValue({
      data: {
        user_id: testUserId,
        status: "PURGED",
        tables: { journal_entries: { updated_rows: 0 } },
        totals: { total_updated_rows: 0 },
      },
      error: null,
    });
    const req = new Request("http://localhost/api/internal/migration/purge", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: testUserId }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(isSafeValue(body), "All response values must be safe (no user text)").toBe(true);
  });

  it("success response includes request_id, user_id, status, tables, totals", async () => {
    vi.mocked(supabaseAdmin!.rpc).mockResolvedValue({
      data: {
        user_id: testUserId,
        status: "PURGED",
        tables: {},
        totals: { total_updated_rows: 0 },
      },
      error: null,
    });
    const req = new Request("http://localhost/api/internal/migration/purge", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: testUserId }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body).toHaveProperty("request_id");
    expect(body).toHaveProperty("user_id");
    expect(body).toHaveProperty("status", "PURGED");
    expect(body).toHaveProperty("tables");
    expect(body).toHaveProperty("totals");
    expect(body.totals).toHaveProperty("total_updated_rows");
    expect(typeof body.totals.total_updated_rows).toBe("number");
  });
});
