/**
 * GET /api/focus/week — deterministic suggestions, max 5, no free text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/focus/week/route";

vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("user-1"),
}));

const mockBuildFocusInputForUser = vi.fn();
vi.mock("@/lib/focus/buildFocusInput", () => ({
  buildFocusInputForUser: (...args: unknown[]) => mockBuildFocusInputForUser(...args),
}));

const mockSuggestWeeklyFocusItems = vi.fn();
vi.mock("@/lib/focus/focusEngine", () => ({
  suggestWeeklyFocusItems: (...args: unknown[]) => mockSuggestWeeklyFocusItems(...args),
}));

const mockGetWeeklyFocusReview = vi.fn();
vi.mock("@/lib/focus/review", () => ({
  getWeeklyFocusReview: (...args: unknown[]) => mockGetWeeklyFocusReview(...args),
}));

describe("GET /api/focus/week", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWeeklyFocusReview.mockResolvedValue({
      weekId: "2026-W08",
      completionScore0to100: 0,
      checkinCount: 0,
      strongestSubjectCode: null,
      weakestSubjectCode: null,
      consistencyTier: "fragile",
      earnedValidationEligible: false,
      earnedValidationReasons: [],
      suggestedNextWeek: [],
    });
    mockBuildFocusInputForUser.mockResolvedValue({
      governance: { riskScore: 0, escalationLevel: 0, recoveryState: "na", disciplineState: "na", focusState: "na" },
      violationCounts7d: { commitmentViolations: 0, abstinenceViolations: 0, commitmentCompleted: 0 },
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      activeCommitments: [],
      focusSessionsLast7d: 0,
    });
    mockSuggestWeeklyFocusItems.mockReturnValue([
      {
        itemId: "wf_commitment_focus_abc12345",
        sourceType: "commitment",
        subjectCode: "focus",
        label: "Deep work",
        priority: 1,
        reasons: [],
      },
    ]);
  });

  it("returns 200 with weekId and items", async () => {
    const req = new Request("http://localhost/api/focus/week");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.weekId).toMatch(/^\d{4}-W\d{2}$/);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeLessThanOrEqual(5);
    expect(typeof body.weekSoFarPercent).toBe("number");
    expect(typeof body.checkinCount).toBe("number");
  });

  it("includes weekSoFarPercent, checkinCount, and submittedToday", async () => {
    mockGetWeeklyFocusReview.mockResolvedValue({
      weekId: "2026-W08",
      completionScore0to100: 75,
      checkinCount: 2,
      submittedToday: true,
      strongestSubjectCode: "focus",
      weakestSubjectCode: null,
      consistencyTier: "steady",
      earnedValidationEligible: true,
      earnedValidationReasons: [],
      suggestedNextWeek: [],
    });
    const req = new Request("http://localhost/api/focus/week");
    const res = await GET(req);
    const body = await res.json();
    expect(body.weekSoFarPercent).toBe(75);
    expect(body.checkinCount).toBe(2);
    expect(body.submittedToday).toBe(true);
  });

  it("returns weekSoFarPercent 0 when no check-in events", async () => {
    mockGetWeeklyFocusReview.mockResolvedValue({
      weekId: "2026-W08",
      completionScore0to100: 0,
      checkinCount: 0,
      strongestSubjectCode: null,
      weakestSubjectCode: null,
      consistencyTier: "fragile",
      earnedValidationEligible: false,
      earnedValidationReasons: [],
      suggestedNextWeek: [],
    });
    const req = new Request("http://localhost/api/focus/week");
    const res = await GET(req);
    const body = await res.json();
    expect(body.weekSoFarPercent).toBe(0);
    expect(body.checkinCount).toBe(0);
  });

  it("no free text in response (including weekSoFarPercent)", async () => {
    const req = new Request("http://localhost/api/focus/week");
    const res = await GET(req);
    const body = await res.json();
    const str = JSON.stringify(body);
    expect(str).not.toMatch(/\b(userMessage|content|note|summary|narrative|free_text)\b/i);
  });

  it("returns deterministic suggestions for same input", async () => {
    mockSuggestWeeklyFocusItems.mockReturnValue([
      { itemId: "wf_focus_focus_0", sourceType: "focus", subjectCode: "focus", label: "Deep work", priority: 1, reasons: ["LOW_FOCUS"] },
    ]);
    const req = new Request("http://localhost/api/focus/week");
    const res1 = await GET(req);
    const res2 = await GET(req);
    const b1 = await res1.json();
    const b2 = await res2.json();
    expect(b1.weekId).toBe(b2.weekId);
    expect(b1.items).toEqual(b2.items);
  });

  it("enforces max 5 items", async () => {
    mockSuggestWeeklyFocusItems.mockReturnValue(
      Array.from({ length: 5 }, (_, i) => ({
        itemId: `wf_commitment_other_${i}`,
        sourceType: "commitment",
        subjectCode: "other",
        label: "Weekly focus",
        priority: 1,
        reasons: [],
      }))
    );
    const req = new Request("http://localhost/api/focus/week");
    const res = await GET(req);
    const body = await res.json();
    expect(body.items.length).toBeLessThanOrEqual(5);
  });

  it("no free text in response", async () => {
    const req = new Request("http://localhost/api/focus/week");
    const res = await GET(req);
    const body = await res.json();
    const str = JSON.stringify(body);
    expect(str).not.toMatch(/\b(userMessage|content|note|summary|narrative|free_text)\b/i);
  });

  it("deduplicates activeValues query param", async () => {
    mockBuildFocusInputForUser.mockResolvedValue({
      governance: { riskScore: 0, escalationLevel: 0, recoveryState: "na", disciplineState: "na", focusState: "na" },
      violationCounts7d: { commitmentViolations: 0, abstinenceViolations: 0, commitmentCompleted: 0 },
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      activeCommitments: [],
      focusSessionsLast7d: 0,
    });
    const req = new Request("http://localhost/api/focus/week?activeValues=discipline,health,discipline");
    await GET(req);
    expect(mockBuildFocusInputForUser).toHaveBeenCalledWith("user-1", ["discipline", "health"]);
  });

  it("empty activeValues query param becomes []", async () => {
    mockBuildFocusInputForUser.mockResolvedValue({
      governance: { riskScore: 0, escalationLevel: 0, recoveryState: "na", disciplineState: "na", focusState: "na" },
      violationCounts7d: { commitmentViolations: 0, abstinenceViolations: 0, commitmentCompleted: 0 },
      contradictionDetected: false,
      contradictedCommitmentIds: [],
      activeCommitments: [],
      focusSessionsLast7d: 0,
    });
    const req = new Request("http://localhost/api/focus/week?activeValues=");
    await GET(req);
    expect(mockBuildFocusInputForUser).toHaveBeenCalledWith("user-1", []);
  });

  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    const { requireUserId } = await import("@/lib/supabase/server-auth");
    vi.mocked(requireUserId).mockResolvedValueOnce(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const req = new Request("http://localhost/api/focus/week");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
