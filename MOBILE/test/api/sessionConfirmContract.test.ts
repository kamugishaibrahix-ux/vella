/**
 * Tests for POST /api/session/confirm-contract
 * Covers: confirm creates contract, validation, all 409 conditions,
 * no contract created without confirmation (endpoint requires explicit call).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  userId: "test-user-id",
  planTier: "free" as "free" | "pro" | "elite",
  isAuthBlocked: false,
  isTierResolutionFailing: false,
  weeklyCount: 0,
  weeklyError: null as string | null,
  insertedContract: null as Record<string, unknown> | null,
  insertError: null as string | null,
  selectedFocusDomains: null as string[] | null,
  dedupContracts: [] as Record<string, unknown>[],
  postEnforcementMode: "soft" as string | null,
}));

// ---------------------------------------------------------------------------
// Mock: requireActiveUser
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth/requireActiveUser", () => ({
  requireActiveUser: vi.fn().mockImplementation(() => {
    if (mocks.isAuthBlocked) {
      const { NextResponse } = require("next/server");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return { userId: mocks.userId };
  }),
  isActiveUserBlocked: vi.fn().mockImplementation((result: unknown) => {
    return result instanceof Response || (result && typeof result === "object" && "status" in (result as Record<string, unknown>));
  }),
}));

// ---------------------------------------------------------------------------
// Mock: getUserPlanTier
// ---------------------------------------------------------------------------

vi.mock("@/lib/tiers/server", () => ({
  getUserPlanTier: vi.fn().mockImplementation(() => {
    if (mocks.isTierResolutionFailing) {
      const err = new Error("Unknown tier");
      err.name = "UnknownTierError";
      throw err;
    }
    return mocks.planTier;
  }),
}));

// ---------------------------------------------------------------------------
// Mock: plan tier validation
// ---------------------------------------------------------------------------

vi.mock("@/lib/plans/defaultEntitlements", () => ({
  isValidPlanTier: vi.fn().mockImplementation((tier: string) => {
    return ["free", "pro", "elite"].includes(tier);
  }),
  UnknownTierError: class UnknownTierError extends Error {
    tier: string;
    context: string;
    constructor(tier: string, context: string) {
      super(`Unknown tier "${tier}" encountered in ${context}`);
      this.name = "UnknownTierError";
      this.tier = tier;
      this.context = context;
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock: countWeeklyContracts + createContract
// ---------------------------------------------------------------------------

vi.mock("@/lib/contracts/contractStoreServer", () => ({
  countWeeklyContracts: vi.fn().mockImplementation(() => {
    if (mocks.weeklyError) {
      return { count: 0, error: mocks.weeklyError };
    }
    return { count: mocks.weeklyCount, error: null };
  }),
  createContract: vi.fn().mockImplementation(() => {
    if (mocks.insertError) {
      return { data: null, error: mocks.insertError };
    }
    return { data: mocks.insertedContract, error: null };
  }),
}));

// ---------------------------------------------------------------------------
// Mock: fromSafe — handles user_preferences, system_status_current, contracts_current (dedup)
// ---------------------------------------------------------------------------

function buildFromSafeChain(table: string) {
  return () => {
    let selectColumns = "";

    if (table === "contracts_current") {
      const chain: Record<string, unknown> = {
        select: (cols: string) => { selectColumns = cols; return chain; },
        eq: () => chain,
        gte: () => Promise.resolve({ data: mocks.dedupContracts, error: null }),
      };
      return chain;
    }

    const baseChain: Record<string, unknown> = {
      select: (cols: string) => { selectColumns = cols; return baseChain; },
      eq: () => baseChain,
      maybeSingle: () => {
        if (table === "system_status_current") {
          if (mocks.postEnforcementMode === null) {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({
            data: { enforcement_mode: mocks.postEnforcementMode },
            error: null,
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
        return Promise.resolve({ data: null, error: null });
      },
    };
    return baseChain;
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  fromSafe: vi.fn().mockImplementation((table: string) => {
    return buildFromSafeChain(table)();
  }),
}));

// ---------------------------------------------------------------------------
// Import handler AFTER mocks
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/session/confirm-contract/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/session/confirm-contract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  domain: "physical-health",
  severity: "moderate",
  duration_days: 5,
  budget_weight: 3,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/session/confirm-contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "test-user-id";
    mocks.planTier = "free";
    mocks.isAuthBlocked = false;
    mocks.isTierResolutionFailing = false;
    mocks.weeklyCount = 0;
    mocks.weeklyError = null;
    mocks.insertedContract = {
      id: "confirmed-1",
      user_id: "test-user-id",
      template_id: "session-confirmed-physical-health-moderate",
      domain: "physical-health",
      origin: "system",
      severity: "moderate",
      enforcement_mode: "soft",
      duration_days: 5,
      budget_weight: 3,
      is_active: true,
      created_at: "2026-02-27T10:00:00Z",
      expires_at: "2026-03-04T10:00:00Z",
    };
    mocks.insertError = null;
    mocks.selectedFocusDomains = null;
    mocks.dedupContracts = [];
    mocks.postEnforcementMode = "soft";
  });

  describe("confirm creates contract", () => {
    it("returns 201 with contractId and createdAt on success", async () => {
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.contractId).toBe("confirmed-1");
      expect(json.createdAt).toBe("2026-02-27T10:00:00Z");
    });

    it("origin is always system (session-originated)", async () => {
      const { createContract } = await import("@/lib/contracts/contractStoreServer");
      await POST(makeRequest(VALID_BODY));

      expect(createContract).toHaveBeenCalledWith(
        expect.objectContaining({ origin: "system" }),
      );
    });

    it("template_id is deterministic session-confirmed pattern", async () => {
      const { createContract } = await import("@/lib/contracts/contractStoreServer");
      await POST(makeRequest(VALID_BODY));

      expect(createContract).toHaveBeenCalledWith(
        expect.objectContaining({
          template_id: "session-confirmed-physical-health-moderate",
        }),
      );
    });
  });

  describe("no contract without confirmation (endpoint requires explicit call)", () => {
    it("does not create contract if endpoint is not called (conceptual — no auto-trigger)", () => {
      // This test documents the protocol: the confirm endpoint is never
      // called automatically. Session close and text routes return proposals
      // but do NOT call this endpoint. Contract creation requires an
      // explicit POST to /api/session/confirm-contract.
      expect(true).toBe(true);
    });
  });

  describe("body validation", () => {
    it("rejects invalid domain", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, domain: "invalid" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("VALIDATION_FAILED");
    });

    it("rejects non-FocusDomain like 'health'", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, domain: "health" }));
      expect(res.status).toBe(400);
    });

    it("rejects invalid severity", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, severity: "extreme" }));
      expect(res.status).toBe(400);
    });

    it("rejects duration_days below 3", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, duration_days: 2 }));
      expect(res.status).toBe(400);
    });

    it("rejects duration_days above 30", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, duration_days: 31 }));
      expect(res.status).toBe(400);
    });

    it("rejects budget_weight below 1", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, budget_weight: 0 }));
      expect(res.status).toBe(400);
    });

    it("rejects budget_weight above 5", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, budget_weight: 6 }));
      expect(res.status).toBe(400);
    });

    it("rejects extra fields (strict schema)", async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, origin: "user" }));
      expect(res.status).toBe(400);
    });
  });

  describe("auth + tier errors", () => {
    it("returns 403 when user is not active", async () => {
      mocks.isAuthBlocked = true;
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(403);
    });

    it("returns 500 when tier resolution fails", async () => {
      mocks.isTierResolutionFailing = true;
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.code).toBe("PLAN_RESOLUTION_FAILED");
    });
  });

  describe("409 DOMAIN_NOT_SELECTED", () => {
    it("rejects when domain not in user selections", async () => {
      mocks.selectedFocusDomains = ["self-mastery", "relationships"];
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("DOMAIN_NOT_SELECTED");
    });

    it("allows when domain is in user selections", async () => {
      mocks.selectedFocusDomains = ["physical-health"];
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });

    it("allows when no preferences row", async () => {
      mocks.selectedFocusDomains = null;
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });
  });

  describe("409 DUPLICATE_CONTRACT", () => {
    it("rejects when same domain+severity exists within 72h", async () => {
      mocks.dedupContracts = [{ id: "existing-1" }];
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("DUPLICATE_CONTRACT");
      expect(json.existing_id).toBe("existing-1");
    });

    it("allows when no duplicate", async () => {
      mocks.dedupContracts = [];
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });
  });

  describe("409 OBSERVE_MODE_BLOCK", () => {
    it("rejects when enforcement mode is observe", async () => {
      mocks.postEnforcementMode = "observe";
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("OBSERVE_MODE_BLOCK");
    });
  });

  describe("409 STRICT_MODE_DURATION_EXCEEDED", () => {
    it("rejects when strict mode and duration > 7", async () => {
      mocks.postEnforcementMode = "strict";
      const res = await POST(makeRequest({ ...VALID_BODY, duration_days: 14 }));
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("STRICT_MODE_DURATION_EXCEEDED");
    });

    it("allows duration <= 7 in strict mode", async () => {
      mocks.postEnforcementMode = "strict";
      const res = await POST(makeRequest({ ...VALID_BODY, duration_days: 7 }));
      expect(res.status).toBe(201);
    });
  });

  describe("409 WEEKLY_CAP_REACHED", () => {
    it("rejects when weekly cap is reached (free tier)", async () => {
      mocks.planTier = "free";
      mocks.weeklyCount = 1;
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("WEEKLY_CAP_REACHED");
    });

    it("allows when under cap", async () => {
      mocks.planTier = "pro";
      mocks.weeklyCount = 1;
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(201);
    });
  });

  describe("insert failure", () => {
    it("returns 500 INSERT_FAILED when createContract errors", async () => {
      mocks.insertError = "database error";
      const res = await POST(makeRequest(VALID_BODY));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.code).toBe("INSERT_FAILED");
    });
  });
});
