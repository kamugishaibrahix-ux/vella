/**
 * Phase M1: Audit route must never return user text.
 * - No keys: content, note, message, summary, title
 * - Values only: numbers, booleans, short enums/strings (e.g. request_id, ISO dates)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/internal/migration/audit/route";

const FORBIDDEN_KEYS = ["content", "note", "message", "summary", "title"] as const;
const MAX_SAFE_STRING_LENGTH = 64;

function collectKeys(obj: unknown, prefix = ""): string[] {
  if (obj == null || typeof obj !== "object") return [];
  const keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    keys.push(path);
    const v = (obj as Record<string, unknown>)[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v) && typeof (v as object) === "object") {
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

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    rpc: vi.fn().mockResolvedValue({
      data: {
        tables: {
          journal_entries: { row_count: 10, rows_with_text: 5, estimated_bytes: 1024, min_created_at: "2025-01-01T00:00:00Z", max_created_at: "2025-02-01T00:00:00Z" },
          conversation_messages: { row_count: 20, rows_with_text: 20, estimated_bytes: 2048, min_created_at: null, max_created_at: null },
        },
        totals: { total_rows: 30, total_rows_with_text: 25, total_estimated_bytes: 3072 },
      },
      error: null,
    }),
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

describe("Migration audit route (no user text)", () => {
  const cronSecret = "test-cron-secret";

  beforeEach(() => {
    process.env.MIGRATION_AUDIT_CRON_SECRET = cronSecret;
  });

  it("returns 401 without cron secret", async () => {
    const req = new Request("http://localhost/api/internal/migration/audit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with cron secret and response has no forbidden keys", async () => {
    const req = new Request("http://localhost/api/internal/migration/audit", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret },
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

  it("response values are only numbers, booleans, or short strings", async () => {
    const req = new Request("http://localhost/api/internal/migration/audit", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(isSafeValue(body), "All response values must be safe (no user text)").toBe(true);
  });

  it("response includes request_id, tables, and totals", async () => {
    const req = new Request("http://localhost/api/internal/migration/audit", {
      method: "POST",
      headers: { "x-cron-secret": cronSecret },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(body).toHaveProperty("request_id");
    expect(body).toHaveProperty("tables");
    expect(body).toHaveProperty("totals");
    expect(body.totals).toMatchObject({
      total_rows: expect.any(Number),
      total_rows_with_text: expect.any(Number),
      total_estimated_bytes: expect.any(Number),
    });
  });
});
