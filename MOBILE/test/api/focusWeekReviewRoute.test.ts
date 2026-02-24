/**
 * GET /api/focus/week/review — aggregation, consistency tier, earned validation, no free text.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/focus/week/review/route";
import {
  aggregateWeeklyFocusCheckins,
  type WeeklyFocusCheckinEvent,
} from "@/lib/focus/review";

function ev(
  subject_code: string,
  numeric_value: number,
  date: string,
  item_id: string
): WeeklyFocusCheckinEvent {
  return { subject_code, numeric_value, occurred_at: `${date}T12:00:00.000Z`, item_id };
}

vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("user-1"),
}));

const mockGetWeeklyFocusReview = vi.fn();
vi.mock("@/lib/focus/review", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/focus/review")>();
  return {
    ...mod,
    getWeeklyFocusReview: (...args: unknown[]) => mockGetWeeklyFocusReview(...args),
  };
});

describe("GET /api/focus/week/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWeeklyFocusReview.mockResolvedValue({
      weekId: "2026-W08",
      completionScore0to100: 72,
      checkinCount: 2,
      strongestSubjectCode: "focus",
      weakestSubjectCode: "other",
      consistencyTier: "mixed",
      earnedValidationEligible: true,
      earnedValidationReasons: ["CONSISTENT_FOCUS_WEEK"],
      suggestedNextWeek: [
        { itemId: "wf_commitment_focus_0", sourceType: "commitment", subjectCode: "focus", label: "Deep work", priority: 1, reasons: [] },
      ],
    });
  });

  it("returns 200 with structured review", async () => {
    const req = new Request("http://localhost/api/focus/week/review?weekId=2026-W08");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.weekId).toBe("2026-W08");
    expect(typeof body.completionScore0to100).toBe("number");
    expect(["steady", "mixed", "fragile"]).toContain(body.consistencyTier);
    expect(typeof body.earnedValidationEligible).toBe("boolean");
    expect(Array.isArray(body.earnedValidationReasons)).toBe(true);
    expect(Array.isArray(body.suggestedNextWeek)).toBe(true);
  });

  it("rejects invalid weekId", async () => {
    const req = new Request("http://localhost/api/focus/week/review?weekId=invalid");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("rejects missing weekId", async () => {
    const req = new Request("http://localhost/api/focus/week/review");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("no free text in response", async () => {
    const req = new Request("http://localhost/api/focus/week/review?weekId=2026-W08");
    const res = await GET(req);
    const body = await res.json();
    const str = JSON.stringify(body);
    expect(str).not.toMatch(/\b(userMessage|content|note|summary|narrative|free_text)\b/i);
  });

  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    const { requireUserId } = await import("@/lib/supabase/server-auth");
    vi.mocked(requireUserId).mockResolvedValueOnce(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const req = new Request("http://localhost/api/focus/week/review?weekId=2026-W08");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe("aggregation consistency tier boundaries", () => {
  const day = "2026-02-16";
  const item = "wf_focus_a1";

  it("steady when avg >= 1.6", () => {
    const result = aggregateWeeklyFocusCheckins([
      ev("focus", 2, day, item),
      ev("focus", 2, day, item),
    ]);
    expect(result.consistencyTier).toBe("steady");
  });

  it("mixed when 0.8 <= avg < 1.6", () => {
    const result = aggregateWeeklyFocusCheckins([
      ev("focus", 1, day, item),
      ev("focus", 2, day, item),
    ]);
    expect(result.consistencyTier).toBe("mixed");
  });

  it("fragile when avg < 0.8", () => {
    const result = aggregateWeeklyFocusCheckins([
      ev("focus", 0, day, item),
      ev("focus", 1, day, item),
    ]);
    expect(result.consistencyTier).toBe("fragile");
  });

  it("earnedValidationEligible when avg >= 1.5", () => {
    const result = aggregateWeeklyFocusCheckins([
      ev("focus", 2, day, item),
      ev("focus", 1, day, item),
    ]);
    expect(result.earnedValidationEligible).toBe(true);
  });
});

describe("earned validation escalation and boundary", () => {
  const eventsAvg15 = [
    ev("focus", 2, "2026-02-16", "wf_focus_a1"),
    ev("focus", 1, "2026-02-16", "wf_focus_a1"),
  ];

  it("avg >= 1.5 but escalation present → eligible = false", () => {
    const result = aggregateWeeklyFocusCheckins(eventsAvg15, {
      hasHighEscalation: true,
      hasSevereBoundary: false,
    });
    expect(result.earnedValidationEligible).toBe(false);
    expect(result.earnedValidationReasons).toContain("ESCALATION_PRESENT");
  });

  it("avg >= 1.5 but boundary severity 2 present → eligible = false", () => {
    const result = aggregateWeeklyFocusCheckins(eventsAvg15, {
      hasHighEscalation: false,
      hasSevereBoundary: true,
    });
    expect(result.earnedValidationEligible).toBe(false);
    expect(result.earnedValidationReasons).toContain("BOUNDARY_TENSION_PRESENT");
  });

  it("avg >= 1.5 and no escalation/boundary → eligible = true", () => {
    const result = aggregateWeeklyFocusCheckins(eventsAvg15, {
      hasHighEscalation: false,
      hasSevereBoundary: false,
    });
    expect(result.earnedValidationEligible).toBe(true);
    expect(result.earnedValidationReasons).not.toContain("ESCALATION_PRESENT");
    expect(result.earnedValidationReasons).not.toContain("BOUNDARY_TENSION_PRESENT");
  });
});

describe("daily-cap completion percentage", () => {
  const days = [
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-02-19",
    "2026-02-20",
    "2026-02-21",
    "2026-02-22",
  ];

  it("Case 1 — Perfect week: 7 days, all items strong → 100%", () => {
    const N = 3;
    const itemIds = ["wf_a_1", "wf_b_2", "wf_c_3"];
    const events: WeeklyFocusCheckinEvent[] = [];
    for (const d of days) {
      for (let i = 0; i < N; i++) {
        events.push(ev("focus", 2, d, itemIds[i]));
      }
    }
    const result = aggregateWeeklyFocusCheckins(events);
    expect(result.completionScore0to100).toBe(100);
  });

  it("Case 2 — Half neutral: 7 days, 1 item, all neutral (weight 2/3)", () => {
    const events = days.map((d) => ev("focus", 1, d, "wf_solo"));
    const result = aggregateWeeklyFocusCheckins(events);
    expect(result.completionScore0to100).toBe(67); // 7 * (2/3) * (100/7) ≈ 66.67 → 67
  });

  it("Case 3 — Missing 2 days: 5 days only, 1 item strong → < 100%", () => {
    const events = days.slice(0, 5).map((d) => ev("focus", 2, d, "wf_solo"));
    const result = aggregateWeeklyFocusCheckins(events);
    expect(result.completionScore0to100).toBeLessThan(100);
    expect(result.completionScore0to100).toBe(71); // 5 * (100/7) ≈ 71.43 → 71
  });

  it("Case 4 — Over-reporting safety: more than N ratings in a day, day capped at DAILY_MAX", () => {
    const events: WeeklyFocusCheckinEvent[] = [
      ev("focus", 2, "2026-02-16", "wf_only"),
      ev("focus", 2, "2026-02-16", "wf_only"),
    ];
    const result = aggregateWeeklyFocusCheckins(events);
    const DAILY_MAX = 100 / 7;
    expect(result.completionScore0to100).toBeLessThanOrEqual(100);
    expect(result.completionScore0to100).toBe(Math.round(DAILY_MAX));
  });

  it("thirds weighting: 2→1, 1→2/3, 0→1/3", () => {
    const oneDay = "2026-02-16";
    const events: WeeklyFocusCheckinEvent[] = [
      ev("a", 2, oneDay, "id1"),
      ev("b", 1, oneDay, "id2"),
      ev("c", 0, oneDay, "id3"),
    ];
    const result = aggregateWeeklyFocusCheckins(events);
    const DAILY_MAX = 100 / 7;
    const expectedDay = (1 + 2 / 3 + 1 / 3) * (DAILY_MAX / 3);
    const expected = Math.round(Math.min(expectedDay, 100));
    expect(result.completionScore0to100).toBe(expected);
  });

  it("Case 5 — N=3 items week: math adjusts properly (strong=1, neutral=2/3)", () => {
    const events: WeeklyFocusCheckinEvent[] = [];
    for (const d of days) {
      events.push(ev("focus", 2, d, "wf_1"));
      events.push(ev("focus", 1, d, "wf_2"));
      events.push(ev("focus", 2, d, "wf_3"));
    }
    const result = aggregateWeeklyFocusCheckins(events);
    expect(result.completionScore0to100).toBeLessThanOrEqual(100);
    const perDay = (1 + 2 / 3 + 1) * (100 / 7 / 3);
    const expected = Math.round(Math.min(7 * perDay, 100));
    expect(result.completionScore0to100).toBe(expected);
  });
});
