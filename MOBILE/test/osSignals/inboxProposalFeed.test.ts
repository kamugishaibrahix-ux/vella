/**
 * Tests for proposal_ready items in the inbox feed.
 * Covers: merge ordering, proposal schema, proposals error → 500,
 * proposal items appear alongside transitions and contracts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/inbox/route";

// Hoisted mocks
const mocks = vi.hoisted(() => ({
  transitionsData: [] as Record<string, unknown>[],
  contractsData: [] as Record<string, unknown>[],
  proposalsData: [] as Record<string, unknown>[],
  transitionsError: null as { message: string } | null,
  contractsError: null as { message: string } | null,
  proposalsError: null as { message: string } | null,
  userId: "test-user-id",
  isAuthBlocked: false,
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

function buildChain(dataRef: () => Record<string, unknown>[], errorRef: () => { message: string } | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => {
      const err = errorRef();
      if (err) return Promise.resolve({ data: null, error: err });
      const sorted = [...dataRef()].sort((a, b) => {
        const aTime = new Date(a.created_at as string).getTime();
        const bTime = new Date(b.created_at as string).getTime();
        return bTime - aTime;
      });
      return Promise.resolve({ data: sorted.slice(0, 20), error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  fromSafe: vi.fn().mockImplementation((table: string) => {
    if (table === "system_transition_log") {
      return buildChain(() => mocks.transitionsData, () => mocks.transitionsError);
    }
    if (table === "contracts_current") {
      return buildChain(() => mocks.contractsData, () => mocks.contractsError);
    }
    if (table === "inbox_proposals_meta") {
      return buildChain(() => mocks.proposalsData, () => mocks.proposalsError);
    }
    const fallback = { select: () => fallback, eq: () => fallback, maybeSingle: () => Promise.resolve({ data: null, error: null }) };
    return fallback;
  }),
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  createAdminClient: () => null,
}));

function makeTransition(id: string, createdAt: string) {
  return {
    id,
    created_at: createdAt,
    previous_phase: "setup",
    new_phase: "steady",
    previous_priority_domain: "none",
    new_priority_domain: "health",
    previous_enforcement_mode: "observe",
    new_enforcement_mode: "soft",
    triggered_by_domain: "health",
    trigger_source: "session_close",
    changed_phase: true,
    changed_priority: true,
    changed_enforcement: true,
    changed_budget: false,
  };
}

function makeContract(id: string, createdAt: string) {
  return {
    id,
    created_at: createdAt,
    domain: "health",
    severity: "moderate",
    origin: "system",
    enforcement_mode: "soft",
    template_id: "template-1",
    expires_at: "2026-03-27T09:00:00Z",
    is_active: true,
  };
}

function makeProposal(id: string, createdAt: string) {
  return {
    id,
    created_at: createdAt,
    type: "proposal_ready",
    domain: "emotional-intelligence",
    severity: "high",
    proposal_id: `proposal::emotional-intelligence::${createdAt}`,
    status: "pending",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transitionsData = [];
  mocks.contractsData = [];
  mocks.proposalsData = [];
  mocks.transitionsError = null;
  mocks.contractsError = null;
  mocks.proposalsError = null;
  mocks.userId = "test-user-id";
  mocks.isAuthBlocked = false;
});

// ---------------------------------------------------------------------------
// Proposal items in the merged feed
// ---------------------------------------------------------------------------

describe("proposal_ready items in inbox feed", () => {
  it("includes proposal_ready items in the response", async () => {
    mocks.proposalsData = [makeProposal("prop-1", "2026-02-27T11:00:00Z")];

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].type).toBe("proposal_ready");
    expect(json.items[0].payload.domain).toBe("emotional-intelligence");
    expect(json.items[0].payload.severity).toBe("high");
    expect(json.items[0].payload.proposal_id).toContain("proposal::");
    expect(json.items[0].payload.status).toBe("pending");
  });

  it("proposal_ready payload has only expected fields (no free text)", async () => {
    mocks.proposalsData = [makeProposal("prop-1", "2026-02-27T11:00:00Z")];

    const res = await GET();
    const json = await res.json();
    const payload = json.items[0].payload;

    expect(Object.keys(payload).sort()).toEqual([
      "created_at",
      "domain",
      "id",
      "proposal_id",
      "severity",
      "status",
      "type",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Merge ordering with proposals
// ---------------------------------------------------------------------------

describe("inbox merge ordering with proposals", () => {
  it("sorts proposal_ready items alongside transitions and contracts by created_at desc", async () => {
    mocks.transitionsData = [makeTransition("trans-1", "2026-02-27T08:00:00Z")];
    mocks.contractsData = [makeContract("contract-1", "2026-02-27T10:00:00Z")];
    mocks.proposalsData = [makeProposal("prop-1", "2026-02-27T09:00:00Z")];

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items).toHaveLength(3);

    // contract-1 (10:00) > prop-1 (09:00) > trans-1 (08:00)
    expect(json.items[0].type).toBe("contract_created");
    expect(json.items[0].payload.id).toBe("contract-1");
    expect(json.items[1].type).toBe("proposal_ready");
    expect(json.items[1].payload.id).toBe("prop-1");
    expect(json.items[2].type).toBe("system_transition");
    expect(json.items[2].payload.id).toBe("trans-1");
  });

  it("newest proposal appears first when it has latest timestamp", async () => {
    mocks.transitionsData = [makeTransition("trans-1", "2026-02-26T10:00:00Z")];
    mocks.proposalsData = [makeProposal("prop-newest", "2026-02-27T14:00:00Z")];

    const res = await GET();
    const json = await res.json();

    expect(json.items[0].type).toBe("proposal_ready");
    expect(json.items[0].payload.id).toBe("prop-newest");
  });

  it("multiple proposals merge correctly", async () => {
    mocks.proposalsData = [
      makeProposal("prop-1", "2026-02-27T08:00:00Z"),
      makeProposal("prop-2", "2026-02-27T12:00:00Z"),
    ];
    mocks.transitionsData = [makeTransition("trans-1", "2026-02-27T10:00:00Z")];

    const res = await GET();
    const json = await res.json();

    expect(json.items).toHaveLength(3);
    // prop-2 (12:00) > trans-1 (10:00) > prop-1 (08:00)
    expect(json.items[0].payload.id).toBe("prop-2");
    expect(json.items[1].payload.id).toBe("trans-1");
    expect(json.items[2].payload.id).toBe("prop-1");
  });
});

// ---------------------------------------------------------------------------
// Proposals error handling
// ---------------------------------------------------------------------------

describe("proposals error handling", () => {
  it("returns 500 INBOX_READ_FAILED when proposals query fails", async () => {
    mocks.proposalsError = { message: "proposals query failed" };

    const res = await GET();
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("inbox_read_failed");
    expect(json.code).toBe("INBOX_READ_FAILED");
  });
});

// ---------------------------------------------------------------------------
// Empty proposals (no proposals)
// ---------------------------------------------------------------------------

describe("empty proposals", () => {
  it("works fine with zero proposals", async () => {
    mocks.transitionsData = [makeTransition("trans-1", "2026-02-27T10:00:00Z")];

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].type).toBe("system_transition");
  });
});
