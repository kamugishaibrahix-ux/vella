/**
 * GET /api/admin/user/:id/metadata: no content/message/note/summary/prompt in response. Metadata only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/admin/user/[id]/metadata/route";
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

describe("GET /api/admin/user/:id/metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminRole).mockResolvedValue({ userId: "admin-1", role: "read_only" });
    mockFromSafe.mockImplementation((table: string) => ({
      select: () => {
        if (table === "subscriptions" || table === "governance_state") {
          return {
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    table === "subscriptions"
                      ? { plan: "free", status: "active" }
                      : { state_json: { governance_risk_score: 0, escalation_level: 0 } },
                }),
            }),
          };
        }
        return {
          eq: () =>
            Promise.resolve({
              data:
                table === "token_usage"
                  ? [{ tokens: 100 }]
                  : table === "conversation_metadata_v2"
                    ? [{ id: "c1" }]
                    : [{ id: "j1" }],
            }),
        };
      },
    }));
  });

  it("returns 200 with metadata when admin", async () => {
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "user-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("plan");
    expect(json).toHaveProperty("token_usage_total");
    expect(json).toHaveProperty("governance_state");
    expect(json).toHaveProperty("conversation_count");
    expect(json).toHaveProperty("journal_count");
  });

  it("response contains no content/message/note/summary/prompt fields", async () => {
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "user-1" }) });
    const json = await res.json();
    expect(hasForbiddenKey(json)).toBe(false);
  });

  it("returns 403 when requireAdminRole returns 403", async () => {
    vi.mocked(requireAdminRole).mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }) as never);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "user-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 when id missing", async () => {
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "" }) });
    expect(res.status).toBe(400);
  });
});
