/**
 * GET /api/admin/subscribers: no content/message/note/summary/prompt in response. Metadata only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/admin/subscribers/route";
import { requireAdminRole } from "@/lib/admin/requireAdminRole";

const FORBIDDEN_CONTENT_KEYS = ["content", "message", "note", "summary", "prompt", "reply", "body", "text"];

function hasForbiddenKey(obj: unknown): boolean {
  if (obj === null || typeof obj !== "object") return false;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (FORBIDDEN_CONTENT_KEYS.includes(key.toLowerCase())) return true;
    if (hasForbiddenKey((obj as Record<string, unknown>)[key])) return true;
  }
  return false;
}

vi.mock("@/lib/admin/requireAdminRole", () => ({
  requireAdminRole: vi.fn(),
}));

const mockFromSafe = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
  fromSafe: (table: string) => mockFromSafe(table),
}));

describe("GET /api/admin/subscribers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminRole).mockResolvedValue({ userId: "admin-1", role: "read_only" });
    mockFromSafe.mockImplementation((table: string) => ({
      select: () =>
        Promise.resolve({
          data:
            table === "subscriptions"
              ? [{ user_id: "u1", plan: "free", status: "active" }]
              : table === "conversation_metadata_v2"
                ? [{ user_id: "u1" }]
                : table === "journal_entries_v2"
                  ? [{ user_id: "u1" }]
                  : table === "governance_state"
                    ? [{ user_id: "u1", state_json: { governance_risk_score: 0, escalation_level: 0 } }]
                    : [],
        }),
    }));
  });

  it("returns 200 with subscribers array when admin", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("subscribers");
    expect(Array.isArray(json.subscribers)).toBe(true);
  });

  it("response contains no content/message/note/summary/prompt fields", async () => {
    const res = await GET();
    const json = await res.json();
    expect(hasForbiddenKey(json)).toBe(false);
  });

  it("subscriber items have only safe scalar fields", async () => {
    const res = await GET();
    const json = await res.json();
    const first = json.subscribers?.[0];
    if (!first) return;
    const allowed = ["user_id", "plan_tier", "subscription_status", "total_sessions", "total_journals", "governance_risk_score", "escalation_level"];
    for (const key of Object.keys(first)) {
      expect(allowed).toContain(key);
    }
    expect(first.user_id).toBeDefined();
    expect(typeof first.total_sessions).toBe("number");
    expect(typeof first.total_journals).toBe("number");
  });

  it("returns 403 when requireAdminRole returns 403", async () => {
    vi.mocked(requireAdminRole).mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }) as never);
    const res = await GET();
    expect(res.status).toBe(403);
  });
});
