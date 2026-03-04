/**
 * Tests for POST /api/inbox/proposals route.
 * Covers: 201 success, 403 auth blocked, 400 validation strictness,
 * 409 duplicate within 72h, 500 on db error, text field rejection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/inbox/proposals/route";
import { NextRequest } from "next/server";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  userId: "test-user-id",
  isAuthBlocked: false,
  selectData: [] as Record<string, unknown>[],
  selectError: null as { message: string } | null,
  insertError: null as { message: string } | null,
}));

vi.mock("@/lib/auth/requireActiveUser", () => ({
  requireActiveUser: vi.fn().mockImplementation(() => {
    if (mocks.isAuthBlocked) {
      return new Response(JSON.stringify({ error: "account_inactive" }), { status: 403 });
    }
    return Promise.resolve({
      userId: mocks.userId,
      plan: "free",
      subscriptionStatus: "active",
    });
  }),
  isActiveUserBlocked: vi.fn().mockImplementation((value: unknown) => {
    return value instanceof Response;
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  fromSafe: vi.fn().mockImplementation(() => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      gte: () => chain,
      limit: () => {
        if (mocks.selectError) {
          return Promise.resolve({ data: null, error: mocks.selectError });
        }
        return Promise.resolve({ data: mocks.selectData, error: null });
      },
      insert: () => {
        if (mocks.insertError) {
          return Promise.resolve({ error: mocks.insertError });
        }
        return Promise.resolve({ error: null });
      },
    };
    return chain;
  }),
  supabaseAdmin: {},
  createAdminClient: () => null,
}));

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/inbox/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  proposal_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  domain: "emotional-intelligence",
  severity: "high",
  reason_codes: ["HIGH_SEVERITY_RECENT"],
  created_at: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "test-user-id";
  mocks.isAuthBlocked = false;
  mocks.selectData = [];
  mocks.selectError = null;
  mocks.insertError = null;
});

// ---------------------------------------------------------------------------
// 201 success
// ---------------------------------------------------------------------------

describe("201 success", () => {
  it("returns 201 with ok:true and proposal_id on valid input", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.proposal_id).toBe(VALID_BODY.proposal_id);
  });
});

// ---------------------------------------------------------------------------
// 403 auth blocked
// ---------------------------------------------------------------------------

describe("403 auth blocked", () => {
  it("returns 403 when user is not active", async () => {
    mocks.isAuthBlocked = true;
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 400 validation strictness
// ---------------------------------------------------------------------------

describe("400 validation strictness", () => {
  it("rejects missing proposal_id", async () => {
    const { proposal_id: _, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it("rejects invalid domain", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, domain: "bogus" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid severity", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, severity: "extreme" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid reason_codes", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, reason_codes: ["INVALID_REASON"] }));
    expect(res.status).toBe(400);
  });

  it("rejects empty reason_codes array", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, reason_codes: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects unknown extra fields (strict mode)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, extra_field: "nope" }));
    expect(res.status).toBe(400);
  });

  it("rejects free-text fields (text)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, text: "journal content" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
  });

  it("rejects free-text fields (title)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, title: "my title" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
  });

  it("rejects free-text fields (content)", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, content: "my content" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("TEXT_NOT_ALLOWED");
  });

  it("rejects created_at older than 7 days", async () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const res = await POST(makeRequest({ ...VALID_BODY, created_at: oldDate }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("PROPOSAL_TOO_OLD");
  });

  it("rejects non-UUID proposal_id", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, proposal_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 409 duplicate within 72h
// ---------------------------------------------------------------------------

describe("409 duplicate within 72h", () => {
  it("returns 409 DUPLICATE_PROPOSAL when pending proposal exists for same domain", async () => {
    mocks.selectData = [{ id: "existing-proposal-id" }];
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("DUPLICATE_PROPOSAL");
  });

  it("allows insert when no existing pending proposal found", async () => {
    mocks.selectData = [];
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 500 on db error
// ---------------------------------------------------------------------------

describe("500 on db error", () => {
  it("returns 500 when dedupe query fails", async () => {
    mocks.selectError = { message: "db error" };
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe("INBOX_PROPOSALS_WRITE_FAILED");
  });

  it("returns 500 when insert fails", async () => {
    mocks.insertError = { message: "insert error" };
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe("INBOX_PROPOSALS_WRITE_FAILED");
  });
});
