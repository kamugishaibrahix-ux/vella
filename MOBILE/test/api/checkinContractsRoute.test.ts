/**
 * Check-in Contracts Route Tests
 * Covers: success path, missing system status, tier resolution failure,
 * contracts list shape + ordering, weekly remaining calculation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/checkin/contracts/route";

// Hoisted mocks for dynamic values accessed in tests
const mocks = vi.hoisted(() => ({
  // fromSafe chain results
  systemStatusData: null as Record<string, unknown> | null,
  resourceBudgetData: null as Record<string, unknown> | null,
  contractsData: [] as Record<string, unknown>[],
  weeklyCount: 0,
  weeklyError: null as string | null,

  // createContract result
  insertedContract: null as Record<string, unknown> | null,
  insertError: null as string | null,

  // POST-specific: domain alignment, dedup, enforcement
  selectedFocusDomains: null as string[] | null,
  dedupContracts: [] as Record<string, unknown>[],
  postEnforcementMode: "soft" as string | null,

  // User/auth
  userId: "test-user-id",
  planTier: "free" as "free" | "pro" | "elite",
  isAuthBlocked: false,
  isTierResolutionFailing: false,
}));

// Mock requireActiveUser
vi.mock("@/lib/auth/requireActiveUser", () => ({
  requireActiveUser: vi.fn().mockImplementation(() => {
    if (mocks.isAuthBlocked) {
      return new Response(JSON.stringify({ error: "account_inactive" }), { status: 403 });
    }
    return Promise.resolve({
      userId: mocks.userId,
      plan: mocks.planTier,
      subscriptionStatus: "active",
    });
  }),
  isActiveUserBlocked: vi.fn().mockImplementation((value: unknown) => {
    return value instanceof Response;
  }),
}));

// Mock getUserPlanTier
vi.mock("@/lib/tiers/server", () => ({
  getUserPlanTier: vi.fn().mockImplementation(() => {
    if (mocks.isTierResolutionFailing) {
      // Throw an error with name UnknownTierError for the route to catch
      const err = new Error('Unknown tier "unknown" encountered in test');
      err.name = "UnknownTierError";
      throw err;
    }
    return Promise.resolve(mocks.planTier);
  }),
  invalidateSubscriptionPlanCache: vi.fn(),
}));

// Mock countWeeklyContracts
vi.mock("@/lib/contracts/contractStoreServer", () => ({
  countWeeklyContracts: vi.fn().mockImplementation(() => {
    return Promise.resolve({
      count: mocks.weeklyCount,
      error: mocks.weeklyError,
    });
  }),
  createContract: vi.fn().mockImplementation(() => {
    if (mocks.insertError) {
      return Promise.resolve({ data: null, error: mocks.insertError });
    }
    return Promise.resolve({ data: mocks.insertedContract, error: null });
  }),
  getActiveContracts: vi.fn(),
  deactivateExpiredContracts: vi.fn(),
}));

// Mock isValidPlanTier
vi.mock("@/lib/plans/defaultEntitlements", () => ({
  isValidPlanTier: vi.fn().mockImplementation((tier: string) => {
    return tier === "free" || tier === "pro" || tier === "elite";
  }),
  UnknownTierError: class extends Error {
    readonly tier: string;
    readonly context: string;
    constructor(tier: string, context: string) {
      super(`Unknown tier "${tier}" encountered in ${context}`);
      this.name = "UnknownTierError";
      this.tier = tier;
      this.context = context;
    }
  },
}));

// Build the fromSafe chain for different tables
// Tracks select columns to distinguish GET vs POST queries on same table
function buildFromSafeChain(table: string) {
  return () => {
    let selectColumns = "";
    let isDedupChain = false;

    if (table === "contracts_current") {
      const chain: Record<string, unknown> = {
        select: (cols: string) => { selectColumns = cols; return chain; },
        eq: (_col: string, _val: unknown) => {
          // If select was "id" this is the dedup query path
          if (selectColumns === "id") isDedupChain = true;
          return chain;
        },
        gt: () => chain,
        // Dedup chain terminal — .gte()
        gte: () => {
          return Promise.resolve({ data: mocks.dedupContracts, error: null });
        },
        // GET chain terminal — .order()
        order: (_column: string, opts?: { ascending?: boolean }) => {
          const sorted = [...mocks.contractsData].sort((a, b) => {
            const aDate = new Date(a.created_at as string).getTime();
            const bDate = new Date(b.created_at as string).getTime();
            return opts?.ascending === false ? bDate - aDate : aDate - bDate;
          });
          return Promise.resolve({ data: sorted, error: null });
        },
      };
      return chain;
    }

    // For tables that end in .maybeSingle()
    const baseChain: Record<string, unknown> = {
      select: (cols: string) => { selectColumns = cols; return baseChain; },
      eq: () => baseChain,
      maybeSingle: () => {
        if (table === "system_status_current") {
          // POST queries only "enforcement_mode"; GET queries include "system_phase"
          if (selectColumns === "enforcement_mode") {
            // POST path: return enforcement mode for POST checks
            if (mocks.postEnforcementMode === null) {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({
              data: { enforcement_mode: mocks.postEnforcementMode },
              error: null,
            });
          }
          // GET path
          return Promise.resolve({
            data: mocks.systemStatusData,
            error: mocks.systemStatusData ? null : { message: "not found" },
          });
        }
        if (table === "resource_budget_current") {
          return Promise.resolve({
            data: mocks.resourceBudgetData,
            error: mocks.resourceBudgetData ? null : { message: "not found" },
          });
        }
        if (table === "user_preferences") {
          if (mocks.selectedFocusDomains === null) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({
            data: { selected_focus_domains: mocks.selectedFocusDomains },
            error: null,
          });
        }
        if (table === "subscriptions") {
          return Promise.resolve({
            data: { plan: mocks.planTier },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };

    return baseChain;
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

describe("GET /api/checkin/contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state
    mocks.systemStatusData = {
      system_phase: "steady",
      top_priority_domain: "health",
      enforcement_mode: "soft",
      confidence_score: 0.85,
      updated_at: new Date().toISOString(),
    };
    mocks.resourceBudgetData = {
      constraint_level: "normal",
      max_focus_minutes_today: 120,
      max_decision_complexity: 5,
      spending_tolerance_band: 0.2,
      recovery_required_hours: 0,
      confidence_score: 0.9,
      is_stale: false,
      updated_at: new Date().toISOString(),
    };
    mocks.contractsData = [];
    mocks.weeklyCount = 0;
    mocks.weeklyError = null;
    mocks.userId = "test-user-id";
    mocks.planTier = "free";
    mocks.isAuthBlocked = false;
    mocks.isTierResolutionFailing = false;
    mocks.insertedContract = null;
    mocks.insertError = null;
    mocks.selectedFocusDomains = null;
    mocks.dedupContracts = [];
    mocks.postEnforcementMode = "soft";
  });

  describe("success path", () => {
    it("returns ok=true with full payload when all data exists", async () => {
      mocks.contractsData = [
        {
          id: "contract-1",
          template_id: "template-1",
          domain: "health",
          origin: "system",
          severity: "moderate",
          enforcement_mode: "soft",
          duration_days: 30,
          budget_weight: 0.5,
          created_at: "2026-02-20T10:00:00Z",
          expires_at: "2026-03-22T10:00:00Z",
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.planTier).toBe("free");
      expect(json.system).toMatchObject({
        phase: "steady",
        top_priority_domain: "health",
        urgency_level: 0.85,
        enforcement_mode: "soft",
      });
      expect(json.budget).toMatchObject({
        constraint_level: "normal",
        max_focus_minutes_today: 120,
        max_decision_complexity: 5,
        spending_tolerance_band: 0.2,
        recovery_required_hours: 0,
        confidence_score: 0.9,
        is_stale: false,
      });
      expect(json.weekly).toMatchObject({
        used: 0,
        cap: 1, // free tier cap
        remaining: 1,
      });
      expect(json.contracts).toHaveLength(1);
      expect(json.contracts[0]).toMatchObject({
        id: "contract-1",
        template_id: "template-1",
        domain: "health",
      });
    });

    it("returns correct weekly cap for pro tier", async () => {
      mocks.planTier = "pro";
      mocks.weeklyCount = 2;

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.planTier).toBe("pro");
      expect(json.weekly).toMatchObject({
        used: 2,
        cap: 3, // pro tier cap
        remaining: 1,
      });
    });

    it("returns correct weekly cap for elite tier", async () => {
      mocks.planTier = "elite";
      mocks.weeklyCount = 3;

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.planTier).toBe("elite");
      expect(json.weekly).toMatchObject({
        used: 3,
        cap: 5, // elite tier cap
        remaining: 2,
      });
    });

    it("returns empty contracts array when no active contracts", async () => {
      mocks.contractsData = [];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.contracts).toEqual([]);
      expect(json.weekly.used).toBe(0);
    });

    it("returns no warnings when system status is fresh", async () => {
      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.warnings).toBeUndefined();
    });
  });

  describe("missing system_status_current", () => {
    it("returns ok=true with system: null and MISSING_SYSTEM_STATUS warning", async () => {
      mocks.systemStatusData = null;

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.system).toBeNull();
      expect(json.warnings).toContain("MISSING_SYSTEM_STATUS");
    });
  });

  describe("stale system status", () => {
    it("returns STALE_SYSTEM_STATUS warning when data is older than 1 hour", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mocks.systemStatusData = {
        system_phase: "steady",
        top_priority_domain: "health",
        enforcement_mode: "soft",
        confidence_score: 0.85,
        updated_at: twoHoursAgo,
      };

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.warnings).toContain("STALE_SYSTEM_STATUS");
    });
  });

  describe("tier resolution failure", () => {
    it("returns 500 with PLAN_RESOLUTION_FAILED when tier resolution fails", async () => {
      mocks.isTierResolutionFailing = true;

      const res = await GET();
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toBe("plan_resolution_failed");
      expect(json.code).toBe("PLAN_RESOLUTION_FAILED");
    });
  });

  describe("contracts list shape + ordering", () => {
    it("returns contracts sorted by created_at descending", async () => {
      mocks.contractsData = [
        {
          id: "contract-old",
          template_id: "template-1",
          domain: "health",
          origin: "system",
          severity: "low",
          enforcement_mode: "observe",
          duration_days: 7,
          budget_weight: 0.3,
          created_at: "2026-02-15T10:00:00Z",
          expires_at: "2026-03-15T10:00:00Z",
        },
        {
          id: "contract-new",
          template_id: "template-2",
          domain: "finance",
          origin: "user",
          severity: "high",
          enforcement_mode: "strict",
          duration_days: 14,
          budget_weight: 0.8,
          created_at: "2026-02-25T10:00:00Z",
          expires_at: "2026-03-25T10:00:00Z",
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.contracts).toHaveLength(2);
      // Should be ordered by created_at desc (newest first)
      expect(json.contracts[0].id).toBe("contract-new");
      expect(json.contracts[1].id).toBe("contract-old");
    });

    it("returns contracts with correct schema fields (no free-text)", async () => {
      mocks.contractsData = [
        {
          id: "contract-1",
          template_id: "template-abc",
          domain: "health",
          origin: "system",
          severity: "moderate",
          enforcement_mode: "soft",
          duration_days: 30,
          budget_weight: 0.5,
          created_at: "2026-02-20T10:00:00Z",
          expires_at: "2026-03-22T10:00:00Z",
        },
      ];

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      const contract = json.contracts[0];

      // Verify all expected fields exist and are non-text types
      expect(contract.id).toBe("contract-1");
      expect(contract.template_id).toBe("template-abc");
      expect(contract.domain).toBe("health");
      expect(contract.origin).toBe("system");
      expect(contract.severity).toBe("moderate");
      expect(contract.enforcement_mode).toBe("soft");
      expect(contract.duration_days).toBe(30);
      expect(contract.budget_weight).toBe(0.5);
      expect(contract.created_at).toBe("2026-02-20T10:00:00Z");
      expect(contract.expires_at).toBe("2026-03-22T10:00:00Z");

      // No unexpected fields
      expect(Object.keys(contract).sort()).toEqual([
        "budget_weight",
        "created_at",
        "domain",
        "duration_days",
        "enforcement_mode",
        "expires_at",
        "id",
        "origin",
        "severity",
        "template_id",
      ]);
    });
  });

  describe("weekly remaining calculation", () => {
    it("calculates remaining = cap - used correctly", async () => {
      mocks.planTier = "pro";
      mocks.weeklyCount = 1;

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.weekly).toMatchObject({
        used: 1,
        cap: 3,
        remaining: 2,
      });
    });

    it("does not return negative remaining (clamped to 0)", async () => {
      mocks.planTier = "free";
      mocks.weeklyCount = 5; // Exceeds free cap of 1

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.weekly).toMatchObject({
        used: 5,
        cap: 1,
        remaining: 0, // Clamped, not negative
      });
    });

    it("handles weekly count error gracefully", async () => {
      mocks.weeklyError = "database error";
      mocks.weeklyCount = 0;

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.weekly.used).toBe(0);
    });
  });

  describe("auth blocked", () => {
    it("returns 403 when user is not active", async () => {
      mocks.isAuthBlocked = true;

      const res = await GET();
      expect(res.status).toBe(403);
    });
  });

  describe("resource budget handling", () => {
    it("returns null budget when resource_budget_current is missing", async () => {
      mocks.resourceBudgetData = null;

      const res = await GET();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.budget).toBeNull();
      expect(json.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/checkin/contracts
// ---------------------------------------------------------------------------

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/checkin/contracts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  template_id: "tpl-sleep-discipline",
  domain: "physical-health",
  severity: "moderate",
  duration_days: 7,
  budget_weight: 3,
};

describe("POST /api/checkin/contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.systemStatusData = null;
    mocks.resourceBudgetData = null;
    mocks.contractsData = [];
    mocks.weeklyCount = 0;
    mocks.weeklyError = null;
    mocks.userId = "test-user-id";
    mocks.planTier = "free";
    mocks.isAuthBlocked = false;
    mocks.isTierResolutionFailing = false;
    mocks.insertedContract = {
      id: "inserted-1",
      user_id: "test-user-id",
      template_id: "tpl-sleep-discipline",
      domain: "physical-health",
      origin: "user",
      severity: "moderate",
      enforcement_mode: "soft",
      duration_days: 7,
      budget_weight: 3,
      is_active: true,
      created_at: "2026-02-27T10:00:00Z",
      expires_at: "2026-03-06T10:00:00Z",
    };
    mocks.insertError = null;
    mocks.selectedFocusDomains = null; // null = no prefs row, allow any domain
    mocks.dedupContracts = [];
    mocks.postEnforcementMode = "soft";
  });

  describe("success path", () => {
    it("returns 201 with inserted contract when under cap (free tier)", async () => {
      mocks.planTier = "free";
      mocks.weeklyCount = 0; // cap=1, used=0

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.contract.id).toBe("inserted-1");
      expect(json.contract.origin).toBe("user");
      expect(json.contract.domain).toBe("physical-health");
      expect(json.weekly).toMatchObject({ used: 1, cap: 1, remaining: 0 });
    });

    it("returns 201 with correct weekly for pro tier", async () => {
      mocks.planTier = "pro";
      mocks.weeklyCount = 1; // cap=3, used=1

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.weekly).toMatchObject({ used: 2, cap: 3, remaining: 1 });
    });

    it("returns 201 with correct weekly for elite tier", async () => {
      mocks.planTier = "elite";
      mocks.weeklyCount = 3; // cap=5, used=3

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.weekly).toMatchObject({ used: 4, cap: 5, remaining: 1 });
    });
  });

  describe("cap enforcement per tier", () => {
    it("rejects with 409 WEEKLY_CAP_REACHED for free tier at cap", async () => {
      mocks.planTier = "free";
      mocks.weeklyCount = 1; // cap=1, used=1

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("WEEKLY_CAP_REACHED");
      expect(json.weekly).toMatchObject({ used: 1, cap: 1, remaining: 0 });
    });

    it("rejects with 409 WEEKLY_CAP_REACHED for pro tier at cap", async () => {
      mocks.planTier = "pro";
      mocks.weeklyCount = 3; // cap=3, used=3

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("WEEKLY_CAP_REACHED");
      expect(json.weekly).toMatchObject({ used: 3, cap: 3, remaining: 0 });
    });

    it("rejects with 409 WEEKLY_CAP_REACHED for elite tier at cap", async () => {
      mocks.planTier = "elite";
      mocks.weeklyCount = 5; // cap=5, used=5

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("WEEKLY_CAP_REACHED");
      expect(json.weekly).toMatchObject({ used: 5, cap: 5, remaining: 0 });
    });

    it("rejects when weekly count exceeds cap (over-count edge case)", async () => {
      mocks.planTier = "free";
      mocks.weeklyCount = 10; // way over cap

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("WEEKLY_CAP_REACHED");
    });
  });

  describe("body validation", () => {
    it("rejects invalid domain", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, domain: "invalid-domain" }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
      expect(json.details.some((d: { path: string }) => d.path === "domain")).toBe(true);
    });

    it("rejects non-FocusDomain like 'health'", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, domain: "health" }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects invalid severity", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, severity: "extreme" }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
      expect(json.details.some((d: { path: string }) => d.path === "severity")).toBe(true);
    });

    it("rejects duration_days below minimum (2)", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, duration_days: 2 }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects duration_days above maximum (31)", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, duration_days: 31 }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects budget_weight above maximum (6)", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, budget_weight: 6 }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects budget_weight below minimum (0)", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, budget_weight: 0 }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects non-integer budget_weight", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, budget_weight: 2.5 }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects missing template_id", async () => {
      const { template_id, ...rest } = VALID_BODY;
      const res = await POST(makePostRequest(rest));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects empty template_id", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, template_id: "" }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("no origin override from client", () => {
    it("rejects body with origin field (strict schema)", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, origin: "system" }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects body with origin=user (strict schema blocks extra fields)", async () => {
      const res = await POST(makePostRequest({ ...VALID_BODY, origin: "user" }));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("auth + tier errors", () => {
    it("returns 403 when user is not active", async () => {
      mocks.isAuthBlocked = true;

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(403);
    });

    it("returns 500 when tier resolution fails", async () => {
      mocks.isTierResolutionFailing = true;

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.code).toBe("PLAN_RESOLUTION_FAILED");
    });
  });

  describe("insert failure", () => {
    it("returns 500 INSERT_FAILED when createContract errors", async () => {
      mocks.insertError = "database insert failed";

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.code).toBe("INSERT_FAILED");
    });
  });

  describe("domain alignment", () => {
    it("rejects with 409 DOMAIN_NOT_SELECTED when domain not in user's selections", async () => {
      mocks.selectedFocusDomains = ["self-mastery", "relationships"];

      const res = await POST(makePostRequest(VALID_BODY)); // domain: physical-health
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("DOMAIN_NOT_SELECTED");
      expect(json.selected).toEqual(["self-mastery", "relationships"]);
    });

    it("allows domain when it IS in user's selections", async () => {
      mocks.selectedFocusDomains = ["physical-health", "self-mastery"];

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });

    it("allows any domain when user has no preferences row (null)", async () => {
      mocks.selectedFocusDomains = null;

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });

    it("allows any domain when selected_focus_domains is empty array", async () => {
      mocks.selectedFocusDomains = [];

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });
  });

  describe("deduplication window (72h)", () => {
    it("rejects with 409 DUPLICATE_CONTRACT when same domain+severity exists within 72h", async () => {
      mocks.dedupContracts = [{ id: "existing-contract-1" }];

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("DUPLICATE_CONTRACT");
      expect(json.existing_id).toBe("existing-contract-1");
    });

    it("allows creation when no duplicate exists", async () => {
      mocks.dedupContracts = [];

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });
  });

  describe("enforcement mode awareness", () => {
    it("rejects with 409 OBSERVE_MODE_BLOCK when enforcement_mode is observe", async () => {
      mocks.postEnforcementMode = "observe";

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("OBSERVE_MODE_BLOCK");
    });

    it("rejects with 409 STRICT_MODE_DURATION_EXCEEDED when strict mode and duration > 7", async () => {
      mocks.postEnforcementMode = "strict";

      const res = await POST(makePostRequest({ ...VALID_BODY, duration_days: 14 }));
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.code).toBe("STRICT_MODE_DURATION_EXCEEDED");
      expect(json.max_duration_days).toBe(7);
    });

    it("allows duration_days <= 7 in strict mode", async () => {
      mocks.postEnforcementMode = "strict";

      const res = await POST(makePostRequest({ ...VALID_BODY, duration_days: 7 }));
      expect(res.status).toBe(201);
    });

    it("allows duration_days = 3 in strict mode (min)", async () => {
      mocks.postEnforcementMode = "strict";

      const res = await POST(makePostRequest({ ...VALID_BODY, duration_days: 3 }));
      expect(res.status).toBe(201);
    });

    it("allows any duration in soft mode", async () => {
      mocks.postEnforcementMode = "soft";

      const res = await POST(makePostRequest({ ...VALID_BODY, duration_days: 30 }));
      expect(res.status).toBe(201);
    });

    it("allows creation when system status is missing (null enforcement)", async () => {
      mocks.postEnforcementMode = null;

      const res = await POST(makePostRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });
  });
});
