import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TransitionSnapshot, TransitionLogParams } from "@/lib/system/transitionLogger";

vi.mock("@/lib/safe/safeSupabaseWrite", () => ({
  safeInsert: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
  fromSafe: vi.fn(),
}));

const mockSafeInsert = vi.mocked(
  (await import("@/lib/safe/safeSupabaseWrite")).safeInsert,
);

function basePrevious(): TransitionSnapshot {
  return {
    phase: "stable",
    priority_domain: "health",
    enforcement_mode: "soft",
    constraint_level: "normal",
  };
}

function baseCurrent(): TransitionSnapshot {
  return {
    phase: "stable",
    priority_domain: "health",
    enforcement_mode: "soft",
    constraint_level: "normal",
  };
}

function makeParams(overrides?: Partial<TransitionLogParams>): TransitionLogParams {
  return {
    userId: "user-1",
    previous: basePrevious(),
    current: baseCurrent(),
    triggerSource: "system_recompute",
    dominantRiskDomain: "none",
    ...overrides,
  };
}

describe("computeChangeFlags", () => {
  let computeChangeFlags: typeof import("@/lib/system/transitionLogger").computeChangeFlags;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ computeChangeFlags } = await import("@/lib/system/transitionLogger"));
  });

  it("returns all false when snapshots are identical", () => {
    const flags = computeChangeFlags(basePrevious(), baseCurrent());
    expect(flags).toEqual({
      changed_phase: false,
      changed_priority: false,
      changed_enforcement: false,
      changed_budget: false,
    });
  });

  it("detects phase change", () => {
    const flags = computeChangeFlags(basePrevious(), { ...baseCurrent(), phase: "overloaded" });
    expect(flags.changed_phase).toBe(true);
    expect(flags.changed_priority).toBe(false);
  });

  it("detects priority change", () => {
    const flags = computeChangeFlags(basePrevious(), { ...baseCurrent(), priority_domain: "financial" });
    expect(flags.changed_priority).toBe(true);
  });

  it("detects enforcement change", () => {
    const flags = computeChangeFlags(basePrevious(), { ...baseCurrent(), enforcement_mode: "strict" });
    expect(flags.changed_enforcement).toBe(true);
  });

  it("detects budget constraint_level change", () => {
    const flags = computeChangeFlags(basePrevious(), { ...baseCurrent(), constraint_level: "critical" });
    expect(flags.changed_budget).toBe(true);
  });

  it("detects multiple simultaneous changes", () => {
    const flags = computeChangeFlags(basePrevious(), {
      phase: "recovery",
      priority_domain: "cognitive",
      enforcement_mode: "observe",
      constraint_level: "constrained",
    });
    expect(flags.changed_phase).toBe(true);
    expect(flags.changed_priority).toBe(true);
    expect(flags.changed_enforcement).toBe(true);
    expect(flags.changed_budget).toBe(true);
  });
});

describe("resolveTriggeredByDomain", () => {
  let resolveTriggeredByDomain: typeof import("@/lib/system/transitionLogger").resolveTriggeredByDomain;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ resolveTriggeredByDomain } = await import("@/lib/system/transitionLogger"));
  });

  it("returns new priority domain when priority changed", () => {
    expect(resolveTriggeredByDomain(true, "financial", "health")).toBe("financial");
  });

  it("falls back to dominantRiskDomain when priority not changed", () => {
    expect(resolveTriggeredByDomain(false, "health", "cognitive")).toBe("cognitive");
  });

  it("falls back to none when priority not changed and dominantRisk is none", () => {
    expect(resolveTriggeredByDomain(false, "health", "none")).toBe("none");
  });
});

describe("appendSystemTransitionIfChanged", () => {
  let appendSystemTransitionIfChanged: typeof import("@/lib/system/transitionLogger").appendSystemTransitionIfChanged;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ appendSystemTransitionIfChanged } = await import("@/lib/system/transitionLogger"));
  });

  it("returns logged:false when previous is null", async () => {
    const result = await appendSystemTransitionIfChanged(makeParams({ previous: null }));
    expect(result.logged).toBe(false);
    expect(mockSafeInsert).not.toHaveBeenCalled();
  });

  it("returns logged:false when nothing changed", async () => {
    const result = await appendSystemTransitionIfChanged(makeParams());
    expect(result.logged).toBe(false);
    expect(mockSafeInsert).not.toHaveBeenCalled();
  });

  it("inserts when phase changes", async () => {
    const result = await appendSystemTransitionIfChanged(
      makeParams({ current: { ...baseCurrent(), phase: "overloaded" } }),
    );
    expect(result.logged).toBe(true);
    expect(mockSafeInsert).toHaveBeenCalledOnce();
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.changed_phase).toBe(true);
    expect(payload.changed_priority).toBe(false);
  });

  it("inserts when priority changes", async () => {
    const result = await appendSystemTransitionIfChanged(
      makeParams({ current: { ...baseCurrent(), priority_domain: "financial" } }),
    );
    expect(result.logged).toBe(true);
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.changed_priority).toBe(true);
  });

  it("inserts when enforcement changes", async () => {
    const result = await appendSystemTransitionIfChanged(
      makeParams({ current: { ...baseCurrent(), enforcement_mode: "strict" } }),
    );
    expect(result.logged).toBe(true);
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.changed_enforcement).toBe(true);
  });

  it("inserts when budget constraint_level changes only", async () => {
    const result = await appendSystemTransitionIfChanged(
      makeParams({ current: { ...baseCurrent(), constraint_level: "critical" } }),
    );
    expect(result.logged).toBe(true);
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.changed_budget).toBe(true);
    expect(payload.changed_phase).toBe(false);
  });

  it("propagates trigger_source correctly", async () => {
    await appendSystemTransitionIfChanged(
      makeParams({
        triggerSource: "session_close",
        current: { ...baseCurrent(), phase: "recovery" },
      }),
    );
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.trigger_source).toBe("session_close");
  });

  it("sets triggered_by_domain to new priority when priority changed", async () => {
    await appendSystemTransitionIfChanged(
      makeParams({
        current: { ...baseCurrent(), priority_domain: "cognitive" },
        dominantRiskDomain: "financial",
      }),
    );
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.triggered_by_domain).toBe("cognitive");
  });

  it("sets triggered_by_domain to dominantRiskDomain when priority not changed", async () => {
    await appendSystemTransitionIfChanged(
      makeParams({
        current: { ...baseCurrent(), phase: "overloaded" },
        dominantRiskDomain: "financial",
      }),
    );
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.triggered_by_domain).toBe("financial");
  });

  it("sets triggered_by_domain to none when no domain matches", async () => {
    await appendSystemTransitionIfChanged(
      makeParams({
        current: { ...baseCurrent(), constraint_level: "constrained" },
        dominantRiskDomain: "none",
      }),
    );
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.triggered_by_domain).toBe("none");
  });

  it("writes correct previous and new constraint levels", async () => {
    await appendSystemTransitionIfChanged(
      makeParams({
        previous: { ...basePrevious(), constraint_level: "constrained" },
        current: { ...baseCurrent(), constraint_level: "critical" },
      }),
    );
    const payload = mockSafeInsert.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.previous_constraint_level).toBe("constrained");
    expect(payload.new_constraint_level).toBe("critical");
  });

  it("returns logged:false when safeInsert returns error", async () => {
    mockSafeInsert.mockResolvedValueOnce({ error: { message: "db error" }, data: null } as unknown as ReturnType<typeof mockSafeInsert>);
    const result = await appendSystemTransitionIfChanged(
      makeParams({ current: { ...baseCurrent(), phase: "overloaded" } }),
    );
    expect(result.logged).toBe(false);
  });
});
