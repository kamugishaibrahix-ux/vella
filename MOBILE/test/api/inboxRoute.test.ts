/**
 * Inbox Route Tests
 * Covers: success with merged feed, max 30 items, no text fields,
 * auth blocked -> 403, db error -> 500, strict descending order
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/inbox/route";

// Hoisted mocks for dynamic values
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

// Mock requireActiveUser
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

// Build the fromSafe chain for different tables
function buildFromSafeChain(table: string) {
  return () => {
    // For system_transition_log - chain ending in .limit() -> Promise
    if (table === "system_transition_log") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => {
          if (mocks.transitionsError) {
            return Promise.resolve({ data: null, error: mocks.transitionsError });
          }
          // Sort by created_at descending (newest first)
          const sorted = [...mocks.transitionsData].sort((a, b) => {
            const aTime = new Date(a.created_at as string).getTime();
            const bTime = new Date(b.created_at as string).getTime();
            return bTime - aTime;
          });
          return Promise.resolve({ data: sorted.slice(0, 20), error: null });
        },
      };
      return chain;
    }

    // For contracts_current - chain ending in .limit() -> Promise
    if (table === "contracts_current") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => {
          if (mocks.contractsError) {
            return Promise.resolve({ data: null, error: mocks.contractsError });
          }
          // Sort by created_at descending (newest first)
          const sorted = [...mocks.contractsData].sort((a, b) => {
            const aTime = new Date(a.created_at as string).getTime();
            const bTime = new Date(b.created_at as string).getTime();
            return bTime - aTime;
          });
          return Promise.resolve({ data: sorted.slice(0, 20), error: null });
        },
      };
      return chain;
    }

    // For inbox_proposals_meta - chain ending in .limit() -> Promise
    if (table === "inbox_proposals_meta") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => {
          if (mocks.proposalsError) {
            return Promise.resolve({ data: null, error: mocks.proposalsError });
          }
          const sorted = [...mocks.proposalsData].sort((a, b) => {
            const aTime = new Date(a.created_at as string).getTime();
            const bTime = new Date(b.created_at as string).getTime();
            return bTime - aTime;
          });
          return Promise.resolve({ data: sorted.slice(0, 20), error: null });
        },
      };
      return chain;
    }

    // Default chain for other tables
    return {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
  };
}

// Mock fromSafe
vi.mock("@/lib/supabase/admin", () => ({
  fromSafe: vi.fn().mockImplementation((table: string) => buildFromSafeChain(table)()),
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  createAdminClient: () => null,
}));

describe("GET /api/inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state
    mocks.transitionsData = [];
    mocks.contractsData = [];
    mocks.proposalsData = [];
    mocks.transitionsError = null;
    mocks.contractsError = null;
    mocks.proposalsError = null;
    mocks.userId = "test-user-id";
    mocks.isAuthBlocked = false;
  });

  describe("success path", () => {
    it("returns merged sorted feed from both sources", async () => {
      // Create transitions with different timestamps
      mocks.transitionsData = [
        {
          id: "trans-1",
          created_at: "2026-02-27T10:00:00Z",
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
        },
        {
          id: "trans-2",
          created_at: "2026-02-26T10:00:00Z",
          previous_phase: "steady",
          new_phase: "struggle",
          previous_priority_domain: "health",
          new_priority_domain: "finance",
          previous_enforcement_mode: "soft",
          new_enforcement_mode: "strict",
          triggered_by_domain: "finance",
          trigger_source: "user_action",
          changed_phase: true,
          changed_priority: true,
          changed_enforcement: true,
          changed_budget: false,
        },
      ];

      mocks.contractsData = [
        {
          id: "contract-1",
          created_at: "2026-02-27T09:00:00Z",
          domain: "health",
          severity: "moderate",
          origin: "system",
          enforcement_mode: "soft",
          template_id: "template-1",
          expires_at: "2026-03-27T09:00:00Z",
          is_active: true,
        },
        {
          id: "contract-2",
          created_at: "2026-02-25T10:00:00Z",
          domain: "finance",
          severity: "high",
          origin: "user",
          enforcement_mode: "strict",
          template_id: "template-2",
          expires_at: "2026-03-25T10:00:00Z",
          is_active: true,
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.items).toHaveLength(4);

      // Check ordering: newest first
      expect(json.items[0].type).toBe("system_transition");
      expect(json.items[0].payload.id).toBe("trans-1");
      expect(json.items[1].type).toBe("contract_created");
      expect(json.items[1].payload.id).toBe("contract-1");
    });

    it("returns empty items array when no data exists", async () => {
      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.items).toEqual([]);
    });

    it("includes correct change_flags in transition payloads", async () => {
      mocks.transitionsData = [
        {
          id: "trans-1",
          created_at: "2026-02-27T10:00:00Z",
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
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      const transition = json.items[0];
      expect(transition.type).toBe("system_transition");
      expect(transition.payload.change_flags).toEqual({
        phase_changed: true,
        priority_changed: true,
        enforcement_changed: true,
        constraint_level_changed: false,
      });
    });
  });

  describe("max 30 items limit", () => {
    it("caps items at maximum 30", async () => {
      // Create 25 transitions and 25 contracts (50 total)
      mocks.transitionsData = Array.from({ length: 25 }, (_, i) => ({
        id: `trans-${i}`,
        created_at: `2026-02-${String(27 - i).padStart(2, "0")}T10:00:00Z`,
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
      }));

      mocks.contractsData = Array.from({ length: 25 }, (_, i) => ({
        id: `contract-${i}`,
        created_at: `2026-02-${String(27 - i).padStart(2, "0")}T09:00:00Z`,
        domain: "health",
        severity: "moderate",
        origin: "system",
        enforcement_mode: "soft",
        template_id: `template-${i}`,
        expires_at: "2026-03-27T09:00:00Z",
        is_active: true,
      }));

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items.length).toBeLessThanOrEqual(30);
    });
  });

  describe("no free text fields", () => {
    it("transition items only contain expected metadata fields", async () => {
      mocks.transitionsData = [
        {
          id: "trans-1",
          created_at: "2026-02-27T10:00:00Z",
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
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      const transition = json.items[0];

      // Verify structure
      expect(transition.type).toBe("system_transition");
      expect(transition.created_at).toBe("2026-02-27T10:00:00Z");

      // Payload should have only expected keys
      const payload = transition.payload;
      expect(Object.keys(payload).sort()).toEqual([
        "change_flags",
        "created_at",
        "id",
        "new_enforcement_mode",
        "new_phase",
        "new_priority_domain",
        "previous_enforcement_mode",
        "previous_phase",
        "previous_priority_domain",
        "trigger_source",
        "triggered_by_domain",
      ]);

      // No free text content
      expect(payload.change_flags).toEqual({
        phase_changed: true,
        priority_changed: true,
        enforcement_changed: true,
        constraint_level_changed: false,
      });
    });

    it("contract items only contain expected metadata fields", async () => {
      mocks.contractsData = [
        {
          id: "contract-1",
          created_at: "2026-02-27T09:00:00Z",
          domain: "health",
          severity: "moderate",
          origin: "system",
          enforcement_mode: "soft",
          template_id: "template-1",
          expires_at: "2026-03-27T09:00:00Z",
          is_active: true,
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      const contract = json.items[0];

      // Verify structure
      expect(contract.type).toBe("contract_created");
      expect(contract.created_at).toBe("2026-02-27T09:00:00Z");

      // Payload should have only expected keys
      const payload = contract.payload;
      expect(Object.keys(payload).sort()).toEqual([
        "created_at",
        "domain",
        "enforcement_mode",
        "expires_at",
        "id",
        "is_active",
        "origin",
        "severity",
        "template_id",
      ]);
    });
  });

  describe("auth blocked", () => {
    it("returns 403 when user is not active", async () => {
      mocks.isAuthBlocked = true;

      const res = await GET();
      expect(res.status).toBe(403);
    });
  });

  describe("database errors", () => {
    it("returns 500 with INBOX_READ_FAILED when transitions query fails", async () => {
      mocks.transitionsError = { message: "database connection failed" };

      const res = await GET();
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toBe("inbox_read_failed");
      expect(json.code).toBe("INBOX_READ_FAILED");
    });

    it("returns 500 with INBOX_READ_FAILED when contracts query fails", async () => {
      mocks.contractsError = { message: "database connection failed" };

      const res = await GET();
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toBe("inbox_read_failed");
      expect(json.code).toBe("INBOX_READ_FAILED");
    });
  });

  describe("ordering strictly descending by created_at", () => {
    it("sorts mixed items correctly by timestamp", async () => {
      // Create interleaved items
      mocks.transitionsData = [
        {
          id: "trans-oldest",
          created_at: "2026-02-25T08:00:00Z",
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
        },
        {
          id: "trans-middle",
          created_at: "2026-02-26T12:00:00Z",
          previous_phase: "steady",
          new_phase: "struggle",
          previous_priority_domain: "health",
          new_priority_domain: "finance",
          previous_enforcement_mode: "soft",
          new_enforcement_mode: "strict",
          triggered_by_domain: "finance",
          trigger_source: "user_action",
          changed_phase: true,
          changed_priority: true,
          changed_enforcement: true,
          changed_budget: false,
        },
      ];

      mocks.contractsData = [
        {
          id: "contract-newest",
          created_at: "2026-02-27T14:00:00Z",
          domain: "career",
          severity: "high",
          origin: "user",
          enforcement_mode: "strict",
          template_id: "template-newest",
          expires_at: "2026-03-27T14:00:00Z",
          is_active: true,
        },
        {
          id: "contract-middle",
          created_at: "2026-02-26T10:00:00Z",
          domain: "health",
          severity: "moderate",
          origin: "system",
          enforcement_mode: "soft",
          template_id: "template-middle",
          expires_at: "2026-03-26T10:00:00Z",
          is_active: true,
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toHaveLength(4);

      // Strictly descending: newest first
      expect(json.items[0].payload.id).toBe("contract-newest");
      expect(json.items[1].payload.id).toBe("trans-middle");
      expect(json.items[2].payload.id).toBe("contract-middle");
      expect(json.items[3].payload.id).toBe("trans-oldest");
    });

    it("handles items with same timestamp consistently", async () => {
      const sameTime = "2026-02-27T10:00:00Z";
      mocks.transitionsData = [
        {
          id: "trans-same",
          created_at: sameTime,
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
        },
      ];

      mocks.contractsData = [
        {
          id: "contract-same",
          created_at: sameTime,
          domain: "health",
          severity: "moderate",
          origin: "system",
          enforcement_mode: "soft",
          template_id: "template-same",
          expires_at: "2026-03-27T10:00:00Z",
          is_active: true,
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      // Both items should be present regardless of sort stability
      const ids = json.items.map((item: { payload: { id: string } }) => item.payload.id);
      expect(ids).toContain("trans-same");
      expect(ids).toContain("contract-same");
    });
  });
});
