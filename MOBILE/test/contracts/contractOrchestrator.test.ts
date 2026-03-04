/**
 * Contract Orchestrator — Unit Tests
 * Mocks all DB and tier calls. Deterministic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Setup ──────────────────────────────────────────────────────────────

const mockSystemStatus = vi.fn();
const mockBudget = vi.fn();
const mockGetTier = vi.fn();
const mockCountWeekly = vi.fn();
const mockGetActive = vi.fn();
const mockCreateContract = vi.fn();

function supabaseChain(resolvedValue: unknown) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue);
  return chain;
}

let systemChain: ReturnType<typeof supabaseChain>;
let budgetChain: ReturnType<typeof supabaseChain>;

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
  fromSafe: (table: string) => {
    if (table === "system_status_current") return systemChain;
    if (table === "resource_budget_current") return budgetChain;
    return supabaseChain({ data: null, error: null });
  },
}));

vi.mock("@/lib/tiers/server", () => ({
  getUserPlanTier: (...args: unknown[]) => mockGetTier(...args),
}));

vi.mock("@/lib/contracts/contractStoreServer", () => ({
  countWeeklyContracts: (...args: unknown[]) => mockCountWeekly(...args),
  getActiveContracts: (...args: unknown[]) => mockGetActive(...args),
  createContract: (...args: unknown[]) => mockCreateContract(...args),
}));

vi.mock("@/lib/telemetry/securityEvents", () => ({
  logSecurityEvent: vi.fn(),
}));

function setupDefaults(overrides: {
  systemData?: Record<string, unknown> | null;
  systemError?: { message: string } | null;
  budgetData?: Record<string, unknown> | null;
  tier?: string;
  weeklyCount?: number;
  activeContracts?: Array<Record<string, unknown>>;
  insertedRow?: Record<string, unknown> | null;
  insertError?: string | null;
} = {}) {
  const {
    systemData = {
      top_priority_domain: "health",
      urgency_level: 30,
      enforcement_mode: "soft",
      updated_at: new Date().toISOString(),
    },
    systemError = null,
    budgetData = null,
    tier = "pro",
    weeklyCount = 0,
    activeContracts = [],
    insertedRow = {
      id: "new-uuid",
      template_id: "health_sleep_regularisation_low",
      domain: "health",
      origin: "system",
      enforcement_mode: "soft",
      severity: "moderate",
      duration_days: 4,
      budget_weight: 2,
      is_active: true,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    },
    insertError = null,
  } = overrides;

  systemChain = supabaseChain({ data: systemData, error: systemError });
  budgetChain = supabaseChain({ data: budgetData, error: null });
  mockGetTier.mockResolvedValue(tier);
  mockCountWeekly.mockResolvedValue({ count: weeklyCount, error: null });
  mockGetActive.mockResolvedValue({ data: activeContracts, error: null });
  mockCreateContract.mockResolvedValue({ data: insertedRow, error: insertError });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("runContractOrchestrator", () => {
  // ── Missing system status ─────────────────────────────────────────────
  it("skips on missing system_status_current (null data)", async () => {
    setupDefaults({ systemData: null });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("MISSING_SYSTEM_STATUS");
  });

  it("skips on system_status_current DB error", async () => {
    setupDefaults({ systemError: { message: "db down" } });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("MISSING_SYSTEM_STATUS");
  });

  // ── Observe mode ──────────────────────────────────────────────────────
  it("skips when enforcement_mode is observe", async () => {
    setupDefaults({
      systemData: {
        top_priority_domain: "health",
        urgency_level: 60,
        enforcement_mode: "observe",
        updated_at: new Date().toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("OBSERVE_MODE");
  });

  // ── Domain selection ──────────────────────────────────────────────────
  it("selects top_priority_domain when it is in selectedDomains", async () => {
    setupDefaults({
      systemData: {
        top_priority_domain: "finance",
        urgency_level: 55,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
      insertedRow: {
        id: "new-uuid",
        template_id: "finance_spending_pause",
        domain: "finance",
        origin: "system",
        enforcement_mode: "soft",
        severity: "moderate",
        duration_days: 5,
        budget_weight: 3,
        is_active: true,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health", "finance"],
      trigger: "manual",
    });

    expect(result.created).toBe(1);
    expect(result.createdContracts[0].domain).toBe("finance");
  });

  it("falls back to first selectedDomain if top_priority not in selectedDomains", async () => {
    setupDefaults({
      systemData: {
        top_priority_domain: "addiction",
        urgency_level: 30,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health", "finance"],
      trigger: "manual",
    });

    // Falls back to health (first selected domain), urgency 30 → low severity
    expect(result.created).toBe(1);
    expect(result.createdContracts[0].domain).toBe("health");
  });

  it("falls back to first selectedDomain if top_priority is not a valid Domain", async () => {
    setupDefaults({
      systemData: {
        top_priority_domain: "none",
        urgency_level: 30,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "scheduler_tick",
    });

    expect(result.created).toBe(1);
    expect(result.createdContracts[0].domain).toBe("health");
  });

  it("skips when selectedDomains is empty", async () => {
    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: [],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("NO_SELECTED_DOMAINS");
  });

  // ── Severity mapping ──────────────────────────────────────────────────
  it("maps urgency >= 80 to severity high", async () => {
    setupDefaults({
      systemData: {
        top_priority_domain: "health",
        urgency_level: 85,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
      budgetData: {
        max_focus_minutes_today: 180,
        recovery_required_hours: 0,
      },
      insertedRow: {
        id: "new-uuid",
        template_id: "health_sleep_regularisation_high",
        domain: "health",
        origin: "system",
        enforcement_mode: "soft",
        severity: "high",
        duration_days: 6,
        budget_weight: 4,
        is_active: true,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 6 * 86400000).toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(1);
    expect(result.createdContracts[0].template_id).toBe("health_sleep_regularisation_high");
  });

  it("maps urgency >= 50 to severity moderate", async () => {
    setupDefaults({
      systemData: {
        top_priority_domain: "finance",
        urgency_level: 55,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
      insertedRow: {
        id: "new-uuid",
        template_id: "finance_spending_pause",
        domain: "finance",
        origin: "system",
        enforcement_mode: "soft",
        severity: "moderate",
        duration_days: 5,
        budget_weight: 3,
        is_active: true,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["finance"],
      trigger: "manual",
    });

    expect(result.created).toBe(1);
    expect(result.createdContracts[0].template_id).toBe("finance_spending_pause");
  });

  it("maps urgency < 50 to severity low", async () => {
    setupDefaults({
      systemData: {
        top_priority_domain: "health",
        urgency_level: 30,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(1);
    // health + low + soft → health_sleep_regularisation_low (compatibility "any")
    expect(result.createdContracts[0].template_id).toBe("health_sleep_regularisation_low");
  });

  // ── Weekly caps ───────────────────────────────────────────────────────
  it("respects weekly cap — free tier with 1 existing skips", async () => {
    setupDefaults({ tier: "free", weeklyCount: 1 });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("WEEKLY_CAP_REACHED");
  });

  it("pro tier with 3 existing skips (cap is 3)", async () => {
    setupDefaults({ tier: "pro", weeklyCount: 3 });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("WEEKLY_CAP_REACHED");
  });

  it("elite tier with 4 existing creates (cap is 5)", async () => {
    setupDefaults({ tier: "elite", weeklyCount: 4 });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(1);
  });

  // ── Dedupe: same template within 72h ──────────────────────────────────
  it("rejects duplicate when same template_id active within 72h", async () => {
    const recentCreatedAt = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12h ago
    setupDefaults({
      activeContracts: [
        {
          id: "existing-1",
          template_id: "health_sleep_regularisation_low",
          domain: "health",
          severity: "low",
          is_active: true,
          created_at: recentCreatedAt,
        },
      ],
      systemData: {
        top_priority_domain: "health",
        urgency_level: 30,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("DUPLICATE_ACTIVE_CONTRACT");
  });

  // ── Dedupe: same domain+severity within 72h ───────────────────────────
  it("rejects duplicate when same domain+severity active within 72h", async () => {
    const recentCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago
    setupDefaults({
      activeContracts: [
        {
          id: "existing-2",
          template_id: "some_other_template",
          domain: "health",
          severity: "low",
          is_active: true,
          created_at: recentCreatedAt,
        },
      ],
      systemData: {
        top_priority_domain: "health",
        urgency_level: 30,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("DUPLICATE_ACTIVE_CONTRACT");
  });

  // ── Dedupe: old contract (>72h) does NOT block ────────────────────────
  it("does not reject when existing contract is older than 72h", async () => {
    const oldCreatedAt = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(); // 80h ago
    setupDefaults({
      activeContracts: [
        {
          id: "existing-old",
          template_id: "health_sleep_regularisation_low",
          domain: "health",
          severity: "low",
          is_active: true,
          created_at: oldCreatedAt,
        },
      ],
      systemData: {
        top_priority_domain: "health",
        urgency_level: 30,
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(1);
  });

  // ── Successful creation ───────────────────────────────────────────────
  it("creates contract and returns correct structure", async () => {
    setupDefaults();

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "session_close",
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.createdContracts).toHaveLength(1);
    expect(result.createdContracts[0].id).toBe("new-uuid");
    expect(result.createdContracts[0].template_id).toBeDefined();
    expect(result.createdContracts[0].domain).toBeDefined();
  });

  // ── No eligible template ──────────────────────────────────────────────
  it("returns NO_ELIGIBLE_TEMPLATE when engine finds no match", async () => {
    setupDefaults({
      systemData: {
        top_priority_domain: "health",
        urgency_level: 55, // moderate — health has no moderate-severity template
        enforcement_mode: "soft",
        updated_at: new Date().toISOString(),
      },
    });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("NO_ELIGIBLE_TEMPLATE");
  });

  // ── Persistence failure ───────────────────────────────────────────────
  it("returns PERSIST_FAILED when createContract errors", async () => {
    setupDefaults({ insertedRow: null, insertError: "db write failed" });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.reasonCodes).toContain("PERSIST_FAILED");
  });

  // ── Fails closed on partial state ─────────────────────────────────────
  it("does not throw on partial state — returns skip result", async () => {
    setupDefaults({ systemData: null });

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    await expect(
      runContractOrchestrator({
        userId: "user-1",
        selectedDomains: ["health"],
        trigger: "manual",
      }),
    ).resolves.toBeDefined();
  });

  // ── Budget defaults ───────────────────────────────────────────────────
  it("uses conservative budget defaults when resource_budget_current is missing", async () => {
    setupDefaults();

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    // Should still create — soft enforcement → default weight 3, enough for health_sleep_regularisation_low (bw 2)
    expect(result.created).toBe(1);
  });

  // ── Tier resolution failure — fail closed ────────────────────────────
  it("skips with PLAN_RESOLUTION_FAILED when getUserPlanTier throws", async () => {
    setupDefaults();
    mockGetTier.mockRejectedValue(new Error("tier lookup failed"));

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    const result = await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.reasonCodes).toContain("PLAN_RESOLUTION_FAILED");
  });

  it("does not call createContract when tier resolution fails", async () => {
    setupDefaults();
    mockGetTier.mockRejectedValue(new Error("tier lookup failed"));

    const { runContractOrchestrator } = await import("@/lib/contracts/contractOrchestrator");
    await runContractOrchestrator({
      userId: "user-1",
      selectedDomains: ["health"],
      trigger: "manual",
    });

    expect(mockCreateContract).not.toHaveBeenCalled();
  });
});
