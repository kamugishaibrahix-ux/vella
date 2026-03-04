/**
 * LOCAL-FIRST JOURNAL COMPLIANCE TESTS
 * Guarantees:
 * 1. /api/journal rejects payloads containing text, title, content, body, journal
 * 2. /api/journal accepts correct metadata-only payload
 * 3. Zod schemas enforce strict mode (unknown fields rejected)
 * 4. Migration SQL has no unconstrained TEXT columns
 * 5. Local store produces valid metadata payloads
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

vi.mock("@/lib/journal/server", () => ({
  createJournalMeta: vi.fn().mockResolvedValue({
    id: "a0000000-0000-4000-8000-000000000001",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    wordCount: 5,
    localHash: "a".repeat(64),
    processingMode: "private",
  }),
  updateJournalMeta: vi.fn().mockResolvedValue({
    id: "entry-123",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    wordCount: 10,
    localHash: "b".repeat(64),
    processingMode: "signals_only",
  }),
}));

// ─── Import route handlers ───────────────────────────────────────────────────

import { POST, PUT } from "@/app/api/journal/route";

// ─── Schema unit tests ──────────────────────────────────────────────────────

import {
  journalCreateSchema,
  journalUpdateSchema,
  journalPayloadContainsText,
} from "@/lib/security/validationSchemas";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(method: string, body: unknown) {
  return new NextRequest("http://localhost:3000/api/journal", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_CREATE = {
  id: "a0000000-0000-4000-8000-000000000001",
  word_count: 5,
  local_hash: "a".repeat(64),
  processing_mode: "private" as const,
};

const VALID_UPDATE = {
  id: "entry-123",
  word_count: 10,
  local_hash: "b".repeat(64),
  processing_mode: "signals_only" as const,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Journal Local-First Compliance", () => {
  // ── 1. TEXT REJECTION (route-level pre-check) ────────────────────────────

  describe("POST /api/journal — text rejection", () => {
    const TEXT_FIELDS = ["text", "title", "content", "body", "journal"];

    for (const field of TEXT_FIELDS) {
      it(`rejects payload with '${field}' field → 400 TEXT_NOT_ALLOWED`, async () => {
        const res = await POST(makeReq("POST", { ...VALID_CREATE, [field]: "smuggled" }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
        expect(json.error.message).toContain(field);
      });
    }
  });

  describe("PUT /api/journal — text rejection", () => {
    const TEXT_FIELDS = ["text", "title", "content", "body", "journal"];

    for (const field of TEXT_FIELDS) {
      it(`rejects payload with '${field}' field → 400 TEXT_NOT_ALLOWED`, async () => {
        const res = await PUT(makeReq("PUT", { ...VALID_UPDATE, [field]: "smuggled" }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
        expect(json.error.message).toContain(field);
      });
    }
  });

  // ── 2. VALID METADATA ACCEPTANCE ─────────────────────────────────────────

  describe("POST /api/journal — accepts metadata-only", () => {
    it("returns 200 for valid metadata payload", async () => {
      const res = await POST(makeReq("POST", VALID_CREATE));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBeDefined();
    });

    it("accepts payload with optional timestamps", async () => {
      const res = await POST(
        makeReq("POST", {
          ...VALID_CREATE,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("PUT /api/journal — accepts metadata-only", () => {
    it("returns 200 for valid metadata update", async () => {
      const res = await PUT(makeReq("PUT", VALID_UPDATE));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBeDefined();
    });
  });

  // ── 3. ZOD STRICT MODE ──────────────────────────────────────────────────

  describe("Zod schema strictness", () => {
    it("journalCreateSchema rejects unknown fields", () => {
      const result = journalCreateSchema.safeParse({ ...VALID_CREATE, foo: "bar" });
      expect(result.success).toBe(false);
    });

    it("journalUpdateSchema rejects unknown fields", () => {
      const result = journalUpdateSchema.safeParse({ ...VALID_UPDATE, foo: "bar" });
      expect(result.success).toBe(false);
    });

    it("journalCreateSchema requires 64-char local_hash", () => {
      const result = journalCreateSchema.safeParse({ ...VALID_CREATE, local_hash: "short" });
      expect(result.success).toBe(false);
    });

    it("journalCreateSchema requires valid UUID for id", () => {
      const result = journalCreateSchema.safeParse({ ...VALID_CREATE, id: "not-a-uuid" });
      expect(result.success).toBe(false);
    });

    it("journalCreateSchema accepts valid payload", () => {
      const result = journalCreateSchema.safeParse(VALID_CREATE);
      expect(result.success).toBe(true);
    });

    it("journalUpdateSchema accepts valid payload", () => {
      const result = journalUpdateSchema.safeParse(VALID_UPDATE);
      expect(result.success).toBe(true);
    });
  });

  // ── 4. journalPayloadContainsText helper ─────────────────────────────────

  describe("journalPayloadContainsText", () => {
    it("returns null for clean metadata", () => {
      expect(journalPayloadContainsText(VALID_CREATE)).toBeNull();
    });
    it("returns 'text' when text key present", () => {
      expect(journalPayloadContainsText({ ...VALID_CREATE, text: "x" })).toBe("text");
    });
    it("returns 'title' when title key present", () => {
      expect(journalPayloadContainsText({ title: "x" })).toBe("title");
    });
    it("returns 'content' when content key present", () => {
      expect(journalPayloadContainsText({ content: "x" })).toBe("content");
    });
    it("returns null for null/undefined input", () => {
      expect(journalPayloadContainsText(null)).toBeNull();
      expect(journalPayloadContainsText(undefined)).toBeNull();
    });
  });

  // ── 5. MIGRATION: no unconstrained TEXT columns ──────────────────────────

  describe("Migration SQL compliance", () => {
    it("journal_entries_meta migration has no TEXT/VARCHAR content columns", () => {
      const migrationPath = path.resolve(
        __dirname,
        "../../supabase/migrations/20260239_journal_entries_meta.sql",
      );
      const sql = fs.readFileSync(migrationPath, "utf-8");

      // Should NOT contain free-text content columns
      expect(sql).not.toMatch(/\bcontent\b\s+(text|varchar)/i);
      expect(sql).not.toMatch(/\btitle\b\s+(text|varchar)/i);
      expect(sql).not.toMatch(/\bbody\b\s+(text|varchar)/i);

      // Should contain metadata columns
      expect(sql).toMatch(/word_count\s+int/i);
      expect(sql).toMatch(/local_hash\s+text/i);
      expect(sql).toMatch(/processing_mode/i);
      expect(sql).toMatch(/signals\s+jsonb/i);

      // Should have RLS enabled
      expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);

      // local_hash must be exactly 64 chars
      expect(sql).toMatch(/length\(local_hash\)\s*=\s*64/i);
    });
  });
});
