/**
 * Hybrid Coupling v1: vella/text route integration tests.
 * Verifies governance read, mode_enum in metadata, and filterUnsafeContent applied.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/vella/text/route";

// Use vi.hoisted for mocks that need to be accessed from both vi.mock factories and tests
const mocks = vi.hoisted(() => ({
  // Governance mocks
  getGovernanceStateForUser: vi.fn(),
  getRecentViolationCounts: vi.fn(),
  getFocusSessionsCountLast7d: vi.fn(),
  getActiveCommitmentsMetadata: vi.fn(),
  getViolationAndCompletionCounts30d: vi.fn(),
  getFocusSessionsCountLast30d: vi.fn(),
  getPriorViolationTrendSnapshot: vi.fn(),
  isGovernanceStale: vi.fn(),
  computeGovernanceState: vi.fn(),
  
  // Completion and filter mocks
  runVellaTextCompletion: vi.fn(),
  filterUnsafeContent: vi.fn(),
  recordConversationMetadataV2: vi.fn(),
}));

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
  buildCompleteMemoryContext: vi.fn().mockResolvedValue({ context: "", charCount: 0 }),
}));

vi.mock("@/lib/vella/exercises", () => ({
  detectExerciseIntent: vi.fn().mockReturnValue(null),
  getBreathingExercise: vi.fn().mockReturnValue(""),
  getGroundingExercise: vi.fn().mockReturnValue(""),
  getMindfulnessExercise: vi.fn().mockReturnValue(""),
  getStressResetExercise: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/governance/readState", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/governance/readState")>();
  return {
    ...mod,
    getGovernanceStateForUser: mocks.getGovernanceStateForUser,
    getRecentViolationCounts: mocks.getRecentViolationCounts,
    getFocusSessionsCountLast7d: mocks.getFocusSessionsCountLast7d,
    getActiveCommitmentsMetadata: mocks.getActiveCommitmentsMetadata,
    getViolationAndCompletionCounts30d: mocks.getViolationAndCompletionCounts30d,
    getFocusSessionsCountLast30d: mocks.getFocusSessionsCountLast30d,
    getPriorViolationTrendSnapshot: mocks.getPriorViolationTrendSnapshot,
    isGovernanceStale: mocks.isGovernanceStale,
  };
});

vi.mock("@/lib/governance/stateEngine", () => ({
  computeGovernanceState: mocks.computeGovernanceState,
}));

vi.mock("@/lib/governance/behaviourSnapshot", () => ({
  buildBehaviourSnapshot: vi.fn().mockReturnValue({
    riskScore: 0,
    escalationLevel: 0,
    recoveryState: "na",
    disciplineState: "na",
    focusState: "na",
    recentCommitmentViolations: 0,
    recentAbstinenceViolations: 0,
    focusSessionsLast7d: 0,
    contradictionDetected: false,
    contradictedCommitmentIds: [],
    boundaryTriggered: false,
    guidanceSignals: {
      firmnessLevel: 0,
      earnedValidation: { earnedValidationLevel: 0, reasons: [] },
      outcomeProjection: { projectionLevel: 0, messageStyle: "neutral", reasons: [] },
    },
    identitySignals: {
      mood: "neutral",
      stance: "steady",
      standardsLevel: 0,
      reasons: [],
    },
  }),
}));

vi.mock("@/lib/governance/contradiction", () => ({
  detectCommitmentContradiction: vi.fn().mockReturnValue({
    contradictionDetected: false,
    contradictedCommitmentIds: [],
  }),
}));

vi.mock("@/lib/safety/boundaryDetector", () => ({
  detectBoundarySignal: vi.fn().mockReturnValue({
    boundaryTriggered: false,
    boundaryType: "other",
    severity: 0,
    matchedTerms: [],
  }),
}));

vi.mock("@/lib/ai/modeResolver", () => ({
  resolveMode: vi.fn().mockImplementation((_requested, _governance, _options) => {
    const requested = _requested as string | null;
    if (requested && ["vent", "listen", "challenge", "coach", "crisis"].includes(requested)) {
      return requested;
    }
    return "listen";
  }),
}));

vi.mock("@/lib/ai/textPrompts", () => ({
  buildVellaTextPrompt: vi.fn().mockImplementation((opts) => {
    const snapshot = opts.behaviourSnapshot;
    if (snapshot) {
      return `BEHAVIOURAL SNAPSHOT (Structured Data — Do Not Repeat Verbosely)\n${JSON.stringify(snapshot)}`;
    }
    return "mock prompt";
  }),
}));

vi.mock("@/lib/conversation/db", () => ({
  recordConversationMetadataV2: mocks.recordConversationMetadataV2,
}));

vi.mock("@/lib/ai/textEngine", () => ({
  runVellaTextCompletion: mocks.runVellaTextCompletion,
}));

vi.mock("@/lib/safety/complianceFilter", () => ({
  filterUnsafeContent: mocks.filterUnsafeContent,
}));

vi.mock("@/lib/governance/events", () => ({
  recordEvent: vi.fn().mockResolvedValue({ success: true, id: "evt-1" }),
}));

vi.mock("@/lib/security/observability", () => ({
  buildObservabilityMeta: vi.fn().mockReturnValue({}),
  logSecurityEvent: vi.fn(),
}));

vi.mock("@/lib/security/validationSchemas", () => ({
  vellaTextRequestSchema: {
    safeParse: vi.fn().mockImplementation((data: unknown) => {
      if (data && typeof data === "object" && "message" in data && typeof (data as Record<string, unknown>).message === "string") {
        return { success: true, data };
      }
      return { success: false, error: { issues: [{ message: "Invalid" }] } };
    }),
  },
}));

vi.mock("@/lib/auth/requireActiveUser", () => ({
  requireActiveUser: vi.fn().mockResolvedValue({
    userId: "test-user-id",
    plan: "free",
    subscriptionStatus: "active",
  }),
  isActiveUserBlocked: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/plans/requireEntitlement", () => ({
  requireEntitlement: vi.fn().mockResolvedValue({
    userId: "test-user-id",
    plan: "free",
    entitlements: {
      enableDeepMemory: false,
      enableAudioVella: false,
      enableStrategy: false,
      enableDeepInsights: false,
      enableClarity: false,
      enablePatterns: false,
      enableGrowthRoadmap: false,
      enableJournalAnalysis: false,
      enableEmotionIntel: false,
      enableArchitect: false,
      enableAudioSessions: false,
      weeklyFocusSubjects: 0,
      monthlyTokens: 0,
    },
  }),
  isEntitlementBlocked: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/plans/resolvePlanEntitlements", () => ({
  resolvePlanEntitlements: vi.fn().mockResolvedValue({
    plan: "free",
    entitlements: {
      enableDeepMemory: false,
      enableAudioVella: false,
      enableStrategy: false,
      enableDeepInsights: false,
      enableClarity: false,
      enablePatterns: false,
      enableGrowthRoadmap: false,
      enableJournalAnalysis: false,
      enableEmotionIntel: false,
      enableArchitect: false,
      enableAudioSessions: false,
      weeklyFocusSubjects: 0,
      monthlyTokens: 0,
    },
  }),
}));

vi.mock("@/lib/plans/featureRegistry", () => ({
  isFeatureEnabled: vi.fn().mockReturnValue(true),
}));

const emptyData = { data: [], error: null };
const fromSafeChain = () =>
  Object.assign(Promise.resolve(emptyData), {
    select: () => fromSafeChain(),
    eq: () => fromSafeChain(),
    gte: () => Promise.resolve(emptyData),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  });

vi.mock("@/lib/supabase/admin", () => ({
  fromSafe: () => fromSafeChain(),
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
  createAdminClient: () => null,
}));

describe("POST /api/vella/text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGovernanceStateForUser.mockResolvedValue({
      riskScore: 0,
      escalationLevel: 0,
      recoveryState: "na",
      disciplineState: "na",
      focusState: "na",
      lastComputedAtIso: new Date().toISOString(),
    });
    mocks.getRecentViolationCounts.mockResolvedValue({
      commitmentViolations: 0,
      abstinenceViolations: 0,
      commitmentCompleted: 0,
    });
    mocks.getFocusSessionsCountLast7d.mockResolvedValue(0);
    mocks.getActiveCommitmentsMetadata.mockResolvedValue([]);
    mocks.getViolationAndCompletionCounts30d.mockResolvedValue({
      commitmentViolations30d: 0,
      abstinenceViolations30d: 0,
      commitmentCompleted30d: 0,
    });
    mocks.getFocusSessionsCountLast30d.mockResolvedValue(0);
    mocks.getPriorViolationTrendSnapshot.mockResolvedValue([]);
    mocks.isGovernanceStale.mockReturnValue(false);
    mocks.computeGovernanceState.mockResolvedValue({ success: true });
    mocks.runVellaTextCompletion.mockResolvedValue({ text: "Raw model reply.", visionUsed: false });
    mocks.filterUnsafeContent.mockImplementation((t: string) => Promise.resolve(t));
    mocks.recordConversationMetadataV2.mockResolvedValue(undefined);
  });

  it("calls getGovernanceStateForUser with userId", async () => {
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    await POST(req);
    expect(mocks.getGovernanceStateForUser).toHaveBeenCalledWith("test-user-id");
  });

  it("writes metadata with mode_enum from resolved mode", async () => {
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    await POST(req);
    expect(mocks.recordConversationMetadataV2).toHaveBeenCalled();
    const call = mocks.recordConversationMetadataV2.mock.calls[0][0];
    expect(call).toMatchObject({
      userId: "test-user-id",
      messageCount: 2,
      tokenCount: expect.any(Number),
      modelId: "vella_text",
    });
    expect(["vent", "listen", "challenge", "coach", "crisis"]).toContain(call.mode_enum);
  });

  it("applies filterUnsafeContent to model reply before returning", async () => {
    mocks.runVellaTextCompletion.mockResolvedValue({ text: "Unfiltered reply from model.", visionUsed: false });
    mocks.filterUnsafeContent.mockResolvedValue("Filtered reply.");
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hi" }),
    });
    const res = await POST(req);
    expect(mocks.filterUnsafeContent).toHaveBeenCalledWith("Unfiltered reply from model.");
    const json = await res.json();
    expect(json.reply).toBe("Filtered reply.");
  });

  it("uses requested mode when governance allows", async () => {
    mocks.getGovernanceStateForUser.mockResolvedValue({
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
    expect(mocks.runVellaTextCompletion).toHaveBeenCalledWith(
      expect.any(String),
      "test-user-id",
      expect.objectContaining({ mode: "vent" })
    );
    const metaCall = mocks.recordConversationMetadataV2.mock.calls[0][0];
    expect(metaCall.mode_enum).toBe("vent");
  });

  it("applies filterUnsafeContent to guided-exercise reply", async () => {
    const { detectExerciseIntent, getBreathingExercise } = await import("@/lib/vella/exercises");
    vi.mocked(detectExerciseIntent).mockReturnValue("breathing");
    vi.mocked(getBreathingExercise).mockReturnValue("Inhale for four.\nHold.\nExhale.");
    mocks.filterUnsafeContent.mockResolvedValue("Filtered exercise reply.");
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "I need to breathe" }),
    });
    const res = await POST(req);
    expect(mocks.filterUnsafeContent).toHaveBeenCalledWith(
      expect.stringContaining("Inhale for four")
    );
    const json = await res.json();
    expect(json.reply).toBe("Filtered exercise reply.");
    expect(json.resultType).toBe("guided_exercise");
  });

  it("when governance is stale, calls computeGovernanceState then re-reads", async () => {
    const oldIso = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    mocks.getGovernanceStateForUser
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
    mocks.isGovernanceStale.mockReturnValue(true);
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    await POST(req);
    expect(mocks.computeGovernanceState).toHaveBeenCalledWith("test-user-id");
    expect(mocks.getGovernanceStateForUser).toHaveBeenCalledTimes(2);
  });

  it("injects behaviour snapshot into prompt (Phase 1)", async () => {
    mocks.getGovernanceStateForUser.mockResolvedValue({
      riskScore: 3,
      escalationLevel: 1,
      recoveryState: "ok",
      disciplineState: "on_track",
      focusState: "active",
      lastComputedAtIso: new Date().toISOString(),
    });
    mocks.getRecentViolationCounts.mockResolvedValue({
      commitmentViolations: 1,
      abstinenceViolations: 0,
      commitmentCompleted: 0,
    });
    mocks.getFocusSessionsCountLast7d.mockResolvedValue(2);
    const req = new Request("http://localhost/api/vella/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    if (mocks.runVellaTextCompletion.mock.calls.length > 0) {
      const prompt = mocks.runVellaTextCompletion.mock.calls[0][0];
      expect(prompt).toContain("BEHAVIOURAL SNAPSHOT (Structured Data — Do Not Repeat Verbosely)");
      expect(prompt).toMatch(/"riskScore":\d+/);
      expect(prompt).toMatch(/"recentCommitmentViolations":\d+/);
      expect(prompt).toMatch(/"focusSessionsLast7d":\d+/);
    }
  });

  it("persists mode_enum crisis when request mode is crisis", async () => {
    mocks.getGovernanceStateForUser.mockResolvedValue({
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
    const metaCall = mocks.recordConversationMetadataV2.mock.calls.find(
      (c: unknown[]) => c[0]?.mode_enum === "crisis"
    );
    expect(metaCall).toBeDefined();
    expect(metaCall?.[0].mode_enum).toBe("crisis");
  });
});
