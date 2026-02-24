/**
 * Phase M4.5: safeTables and export routes after legacy content drop.
 */

import { describe, it, expect, vi } from "vitest";
import { SAFE_TABLES } from "@/lib/supabase/safeTables";
import { GET as getJournals } from "@/app/api/migration/export/journals/route";
import { GET as getCheckins } from "@/app/api/migration/export/checkins/route";
import { GET as getConversations } from "@/app/api/migration/export/conversations/route";
import { GET as getReports } from "@/app/api/migration/export/reports/route";

const LEGACY_CONTENT_TABLES = [
  "journal_entries",
  "conversation_messages",
  "check_ins",
  "user_reports",
] as const;

vi.mock("@/lib/migration/exportGuard", () => ({
  guardMigrationExport: vi.fn(() => Promise.resolve({ userId: "test-user", requestId: "req-1" })),
  NO_CACHE_HEADERS: {},
}));

describe("M4.5 legacy content dropped", () => {
  it("safeTables does not include legacy content tables", () => {
    const set = new Set(SAFE_TABLES);
    for (const name of LEGACY_CONTENT_TABLES) {
      expect(set.has(name as never), `safeTables must not include ${name}`).toBe(false);
    }
  });

  it("safeTables still includes v2 and memory_chunks", () => {
    const set = new Set(SAFE_TABLES);
    expect(set.has("journal_entries_v2" as never)).toBe(true);
    expect(set.has("check_ins_v2" as never)).toBe(true);
    expect(set.has("conversation_metadata_v2" as never)).toBe(true);
    expect(set.has("user_reports_v2" as never)).toBe(true);
    expect(set.has("memory_chunks" as never)).toBe(true);
  });

  it("journals export returns 410 with legacy_schema_dropped", async () => {
    const res = await getJournals(new Request("http://localhost/api/migration/export/journals"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("legacy_schema_dropped");
  });

  it("checkins export returns 410 with legacy_schema_dropped", async () => {
    const res = await getCheckins(new Request("http://localhost/api/migration/export/checkins"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("legacy_schema_dropped");
  });

  it("conversations export returns 410 with legacy_schema_dropped", async () => {
    const res = await getConversations(new Request("http://localhost/api/migration/export/conversations"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("legacy_schema_dropped");
  });

  it("reports export returns 410 with legacy_schema_dropped", async () => {
    const res = await getReports(new Request("http://localhost/api/migration/export/reports"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("legacy_schema_dropped");
  });
});
