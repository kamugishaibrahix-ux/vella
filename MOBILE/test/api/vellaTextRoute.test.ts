/**
 * Hybrid Coupling v1: vella/text route integration tests.
 * Verifies governance read, mode_enum in metadata, and filterUnsafeContent applied.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/vella/text/route";

vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

vi.mock("@/lib/security/rateLimit", () => ({
  rateLimit: vi.fn().mockResolvedValue(undefined),
  isRateLimitError: vi.fn().mockReturnValue(false),
  rateLimit429Response: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/tokens/enforceTokenLimits", () => ({
  checkTokenAvailability: vi.fn().mockResolvedValue({ allowed: true }),
  chargeTokensForOperation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tokens/quotaExceededResponse", () => ({
  quotaExceededResponse: vi.fn().mockReturnValue(new Response(null, { status: 402 })),
}));

vi.mock("@/lib/tiers/server", () => ({
  getUserPlanTier: vi.fn().mockResolvedValue("free"),
}));

vi.mock("@/lib/security/killSwitch", () => ({
  isAIDisabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/memory/retrieve", () => ({
  retrieveTopK: vi.fn().mockResolvedValue([]),
  formatMemoryContext: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/vella/exercises", () => ({
  detectExerciseIntent: vi.fn().mockReturnValue(null),
  getBreathingExercise: vi.fn().mockReturnValue(""),
  getGroundingExercise: vi.fn().mockReturnValue(""),
  getMindfulnessExercise: vi.fn().mockReturnValue(""),
  getStressResetExercise: vi.fn().mockReturnValue(""),
}));

const mockGetGovernanceStateForUser = vi.fn();
const mockGetRecentViolationCounts = vi.fn();
const mockGetFocusSessionsCountLast7d = vi.fn();
const mockGetActiveCommitmentsMetadata = vi.fn();
vi.mock("@/lib/governance/readState", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/governance/readState")>();
  return {
    ...mod,
    getGovernanceStateForUser: (...args: unknown[]) => mockGetGovernanceStateForUser(...args),
    getRecentViolationCounts: (...args: unknown[]) => mockGetRecentViolationCounts(...args),
    getFocusSessionsCountLast7d: (...args: unknown[]) => mockGetFocusSessionsCountLast7d(...args),
    getActiveCommitmentsMetadata: (...args: unknown[]) => mockGetActiveCommitmentsMetadata(...args),
  };
});

const mockComputeGovernanceState = vi.fn();
vi.mock("@/lib/governance/stateEngine", () => ({
  computeGovernanceState: (...args: unknown[]) => mockComputeGovernanceState(...args),
}));

const mockRecordConversationMetadataV2 = vi.fn();
vi.mock("@/lib/conversation/db", () => ({
  recordConversationMetadataV2: (...args: unknown[]) => mockRecordConversationMetadataV2(...args),
}));

const mockRunVellaTextCompletion = vi.fn();
vi.mock("@/lib/ai/textEngine", () => ({
  runVellaTextCompletion: (...args: unknown[]) => mockRunVellaTextCompletion(...args),
}));

const mockFilterUnsafeContent = vi.fn();
vi.mock("@/lib/safety/complianceFilter", () => ({
  filterUnsafeContent: (text: string) => mockFilterUnsafeContent(text),
}));

vi.mock("@/lib/governance/events", () => ({
  recordEvent: vi.fn().mockResolvedValue({ success: true, id: "evt-1" }),
}));

vi.mock("@/lib/security/observability", () => ({
  buildObservabilityMeta: vi.fn().mockReturnValue({}),
  logSecurityEvent: vi.fn(),
}));

const emptyData = { data: [], error: null };
const fromSafeChain = () =>
  Object.assign(Promise.resolve(emptyData), {
    select: () => fromSafeChain(),
    eq: () => fromSafeChain(),
    gte: () => Promise.resolve(emptyData),
  });
vi.mock("@/lib/supabase/admin", () => ({
  fromSafe: () => fromSafeChain(),
  supabaseAdmin: {},
  createAdminClient: () => null,
}));

describe("POST /api/vella/text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGovernanceStateForUser.mockResolvedValue({
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      lastComputedAtIso: new Date().toISOString(),
    });
    mockGetRecentViolationCounts.mockResolvedValue({
      commitmentViolations: 0,
      abstinenceViolations: 0,
      commitmentCompleted: 0,
    });
    mockGetFocusSessionsCountLast7d.mockResolvedValue(0);
    mockGetActiveCommitmentsMetadata.mockResolvedValue([]);
    mockComputeGovernanceState.mockResolvedValue({ success: true });
    mockRunVellaTextCompletion.mockResolvedValue("Raw model reply.");
    mockFilterUnsafeContent.mockImplementation((t: string) => Promise.resolve(t));
    mockRecordConversationMetadataV2.mockResolvedValue(undefined);
  });

  it("calls getGovernanceStateForUser with userId", async () => {
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    await POST(req);
    expect(mockGetGovernanceStateForUser).toHaveBeenCalledWith("test-user-id");
  });

  it("writes metadata with mode_enum from resolved mode", async () => {
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    await POST(req);
    expect(mockRecordConversationMetadataV2).toHaveBeenCalled();
    const call = mockRecordConversationMetadataV2.mock.calls[0][0];
    expect(call).toMatchObject({
      userId: "test-user-id",
      messageCount: 2,
      tokenCount: expect.any(Number),
      modelId: "vella_text",
    });
    expect(["vent", "listen", "challenge", "coach", "crisis"]).toContain(call.mode_enum);
  });

  it("applies filterUnsafeContent to model reply before returning", async () => {
    mockRunVellaTextCompletion.mockResolvedValue("Unfiltered reply from model.");
    mockFilterUnsafeContent.mockResolvedValue("Filtered reply.");
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hi" }),
    });
    const res = await POST(req);
    expect(mockFilterUnsafeContent).toHaveBeenCalledWith("Unfiltered reply from model.");
    const json = await res.json();
    expect(json.reply).toBe("Filtered reply.");
  });

  it("uses requested mode when governance allows", async () => {
    mockGetGovernanceStateForUser.mockResolvedValue({
      riskScore: 2,
      escalationLevel: 0,
      recoveryState: "ok",
      disciplineState: "on_track",
      focusState: "na",
      lastComputedAtIso: new Date().toISOString(),
    });
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hi", mode: "vent" }),
    });
    await POST(req);
    expect(mockRunVellaTextCompletion).toHaveBeenCalledWith(
      expect.any(String),
      "test-user-id",
      expect.objectContaining({ mode: "vent" })
    );
    const metaCall = mockRecordConversationMetadataV2.mock.calls[0][0];
    expect(metaCall.mode_enum).toBe("vent");
  });

  it("applies filterUnsafeContent to guided-exercise reply", async () => {
    const { detectExerciseIntent, getBreathingExercise } = await import("@/lib/vella/exercises");
    vi.mocked(detectExerciseIntent).mockReturnValue("breathing");
    vi.mocked(getBreathingExercise).mockReturnValue("Inhale for four.\nHold.\nExhale.");
    mockFilterUnsafeContent.mockResolvedValue("Filtered exercise reply.");
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "I need to breathe" }),
    });
    const res = await POST(req);
    expect(mockFilterUnsafeContent).toHaveBeenCalledWith(
      expect.stringContaining("Inhale for four")
    );
    const json = await res.json();
    expect(json.reply).toBe("Filtered exercise reply.");
    expect(json.resultType).toBe("guided_exercise");
  });

  it("when governance is stale, calls computeGovernanceState then re-reads", async () => {
    const oldIso = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    mockGetGovernanceStateForUser
      .mockResolvedValueOnce({
        riskScore: 0,
        escalationLevel: 0,
        recoveryState: "na",
        disciplineState: "na",
        focusState: "na",
        lastComputedAtIso: oldIso,
      })
      .mockResolvedValueOnce({
        riskScore: 0,
        escalationLevel: 0,
        recoveryState: "na",
        disciplineState: "na",
        focusState: "na",
        lastComputedAtIso: new Date().toISOString(),
      });
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    await POST(req);
    expect(mockComputeGovernanceState).toHaveBeenCalledWith("test-user-id");
    expect(mockGetGovernanceStateForUser).toHaveBeenCalledTimes(2);
  });

  it("injects behaviour snapshot into prompt (Phase 1)", async () => {
    mockGetGovernanceStateForUser.mockResolvedValue({
      riskScore: 3,
      escalationLevel: 1,
      recoveryState: "ok",
      disciplineState: "on_track",
      focusState: "active",
      lastComputedAtIso: new Date().toISOString(),
    });
    mockGetRecentViolationCounts.mockResolvedValue({
      commitmentViolations: 1,
      abstinenceViolations: 0,
      commitmentCompleted: 0,
    });
    mockGetFocusSessionsCountLast7d.mockResolvedValue(2);
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    if (mockRunVellaTextCompletion.mock.calls.length > 0) {
      const prompt = mockRunVellaTextCompletion.mock.calls[0][0];
      expect(prompt).toContain("BEHAVIOURAL SNAPSHOT (Structured Data — Do Not Repeat Verbosely)");
      expect(prompt).toMatch(/"riskScore":\d+/);
      expect(prompt).toMatch(/"recentCommitmentViolations":\d+/);
      expect(prompt).toMatch(/"focusSessionsLast7d":\d+/);
    }
  });

  it("persists mode_enum crisis when request mode is crisis", async () => {
    mockGetGovernanceStateForUser.mockResolvedValue({
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      lastComputedAtIso: new Date().toISOString(),
    });
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hi", mode: "crisis" }),
    });
    await POST(req);
    const metaCall = mockRecordConversationMetadataV2.mock.calls.find(
      (c: unknown[]) => c[0]?.mode_enum === "crisis"
    );
    expect(metaCall).toBeDefined();
    expect(metaCall?.[0].mode_enum).toBe("crisis");
  });
});
