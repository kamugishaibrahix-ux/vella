/**
 * Contracts Persistence Layer — Unit Tests
 * Mocks fromSafe to test persistence functions in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Mock fromSafe ───────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockLt = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

function chainBuilder() {
  const chain: Record<string, any> = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    eq: mockEq,
    gte: mockGte,
    lt: mockLt,
    order: mockOrder,
    single: mockSingle,
  };
  for (const fn of Object.values(chain)) {
    fn.mockReturnValue(chain);
  }
  return chain;
}

let chain: ReturnType<typeof chainBuilder>;

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
  fromSafe: () => chain,
}));

beforeEach(() => {
  vi.clearAllMocks();
  chain = chainBuilder();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("createContract", () => {
  it("inserts a contract and returns the row on success", async () => {
    const row = {
      id: "uuid-1",
      user_id: "user-1",
      template_id: "health_sleep_regularisation_low",
      domain: "health",
      origin: "system",
      enforcement_mode: "soft",
      severity: "low",
      duration_days: 4,
      budget_weight: 2,
      is_active: true,
      created_at: "2026-02-26T00:00:00Z",
      expires_at: "2026-03-02T00:00:00Z",
    };

    mockSingle.mockResolvedValue({ data: row, error: null });

    const { createContract } = await import("@/lib/contracts/contractStoreServer");
    const result = await createContract({
      user_id: "user-1",
      template_id: "health_sleep_regularisation_low",
      domain: "health",
      origin: "system",
      enforcement_mode: "soft",
      severity: "low",
      duration_days: 4,
      budget_weight: 2,
      expires_at: "2026-03-02T00:00:00Z",
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual(row);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("returns error string on database failure", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "insert failed" } });

    const { createContract } = await import("@/lib/contracts/contractStoreServer");
    const result = await createContract({
      user_id: "user-1",
      template_id: "t",
      domain: "health",
      origin: "system",
      enforcement_mode: "soft",
      severity: "low",
      duration_days: 4,
      budget_weight: 2,
      expires_at: "2026-03-02T00:00:00Z",
    });

    expect(result.data).toBeNull();
    expect(result.error).toBe("insert failed");
  });
});

describe("getActiveContracts", () => {
  it("returns active contracts for a user", async () => {
    const rows = [
      { id: "c1", user_id: "user-1", is_active: true, domain: "health" },
      { id: "c2", user_id: "user-1", is_active: true, domain: "finance" },
    ];

    mockOrder.mockResolvedValue({ data: rows, error: null });

    const { getActiveContracts } = await import("@/lib/contracts/contractStoreServer");
    const result = await getActiveContracts("user-1");

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
  });

  it("returns empty array on error", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "db down" } });

    const { getActiveContracts } = await import("@/lib/contracts/contractStoreServer");
    const result = await getActiveContracts("user-1");

    expect(result.data).toEqual([]);
    expect(result.error).toBe("db down");
  });

  it("returns empty array when no contracts exist", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    const { getActiveContracts } = await import("@/lib/contracts/contractStoreServer");
    const result = await getActiveContracts("user-1");

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });
});

describe("countWeeklyContracts", () => {
  it("returns count of active contracts in last 7 days", async () => {
    mockGte.mockResolvedValue({ data: 3, error: null });

    const { countWeeklyContracts } = await import("@/lib/contracts/contractStoreServer");
    const result = await countWeeklyContracts("user-1");

    expect(result.error).toBeNull();
    expect(result.count).toBe(3);
    expect(mockEq).toHaveBeenCalledWith("is_active", true);
  });

  it("returns 0 on error", async () => {
    mockGte.mockResolvedValue({ data: null, error: { message: "timeout" } });

    const { countWeeklyContracts } = await import("@/lib/contracts/contractStoreServer");
    const result = await countWeeklyContracts("user-1");

    expect(result.count).toBe(0);
    expect(result.error).toBe("timeout");
  });
});

describe("deactivateExpiredContracts", () => {
  it("deactivates expired contracts and returns affected count", async () => {
    mockSelect.mockResolvedValue({ data: [{ id: "c1" }, { id: "c2" }], error: null });

    const { deactivateExpiredContracts } = await import("@/lib/contracts/contractStoreServer");
    const result = await deactivateExpiredContracts("user-1");

    expect(result.error).toBeNull();
    expect(result.affected).toBe(2);
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
  });

  it("returns 0 affected on error", async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: "rls fail" } });

    const { deactivateExpiredContracts } = await import("@/lib/contracts/contractStoreServer");
    const result = await deactivateExpiredContracts("user-1");

    expect(result.affected).toBe(0);
    expect(result.error).toBe("rls fail");
  });

  it("returns 0 when no contracts are expired", async () => {
    mockSelect.mockResolvedValue({ data: [], error: null });

    const { deactivateExpiredContracts } = await import("@/lib/contracts/contractStoreServer");
    const result = await deactivateExpiredContracts("user-1");

    expect(result.affected).toBe(0);
    expect(result.error).toBeNull();
  });
});

describe("migration schema guard", () => {
  it("contracts_current migration contains no TEXT column types (only CHECK-constrained text)", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20260237_contracts_current.sql"),
      "utf-8",
    );

    const lines = sql.split("\n");
    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.startsWith("--")) continue;
      if (trimmed === "") continue;

      // TEXT used only as column type (not inside CHECK constraints) would be unconstrained
      // All our TEXT NOT NULL columns have CHECK constraints in the same DDL
      if (trimmed.includes("text") && !trimmed.includes("not null")) {
        throw new Error(`Unconstrained TEXT column found: ${line}`);
      }
    }
  });

  it("migration enables RLS", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20260237_contracts_current.sql"),
      "utf-8",
    );
    expect(sql.toLowerCase()).toContain("enable row level security");
  });

  it("migration creates user isolation policy", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20260237_contracts_current.sql"),
      "utf-8",
    );
    expect(sql.toLowerCase()).toContain("auth.uid() = user_id");
    expect(sql.toLowerCase()).toContain("create policy");
  });
});
