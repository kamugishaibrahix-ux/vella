/**
 * POST /api/check-ins/weekly-focus — validation, no free text, storage shape.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/check-ins/weekly-focus/route";

vi.mock("@/lib/supabase/server-auth", () => ({
  requireUserId: vi.fn().mockResolvedValue("user-1"),
}));

const mockRecordEvent = vi.fn();
vi.mock("@/lib/governance/events", () => ({
  recordEvent: (...args: unknown[]) => mockRecordEvent(...args),
}));

describe("POST /api/check-ins/weekly-focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordEvent.mockResolvedValue({ success: true, id: "ev-1" });
  });

  it("returns 200 and ok: true for valid body", async () => {
    const body = {
      weekId: "2026-W08",
      dateIso: "2026-02-22",
      ratings: [
        { itemId: "wf_commitment_focus_abc12345", subjectCode: "focus", sourceType: "commitment", rating: "strong" },
      ],
    };
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      "user-1",
      "weekly_focus_checkin",
      "focus",
      2,
      { week_id: "2026-W08", item_id: "wf_commitment_focus_abc12345", source_type: "commitment" },
      expect.stringMatching(/^2026-02-22T12:00:00\.000Z$/)
    );
  });

  it("rejects invalid weekId", async () => {
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: "invalid",
        dateIso: "2026-02-22",
        ratings: [{ itemId: "wf_commitment_focus_0", subjectCode: "focus", sourceType: "commitment", rating: "strong" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid rating", async () => {
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: "2026-W08",
        dateIso: "2026-02-22",
        ratings: [{ itemId: "wf_commitment_focus_0", subjectCode: "focus", sourceType: "commitment", rating: "invalid" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects more than 5 ratings", async () => {
    const ratings = Array.from({ length: 6 }, (_, i) => ({
      itemId: `wf_commitment_other_${i}`,
      subjectCode: "other",
      sourceType: "commitment",
      rating: "neutral",
    }));
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: "2026-W08", dateIso: "2026-02-22", ratings }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid itemId format", async () => {
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: "2026-W08",
        dateIso: "2026-02-22",
        ratings: [{ itemId: "not_wf_format", subjectCode: "focus", sourceType: "commitment", rating: "strong" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("maps strong=2, neutral=1, struggling=0", async () => {
    const body = {
      weekId: "2026-W08",
      dateIso: "2026-02-22",
      ratings: [
        { itemId: "wf_commitment_other_0", subjectCode: "other", sourceType: "commitment", rating: "struggling" },
      ],
    };
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await POST(req);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.any(String),
      "weekly_focus_checkin",
      "other",
      0,
      expect.objectContaining({ week_id: "2026-W08", item_id: "wf_commitment_other_0", source_type: "commitment" }),
      expect.any(String)
    );
  });

  it("returns 401 when not authenticated", async () => {
    const { NextResponse } = await import("next/server");
    const { requireUserId } = await import("@/lib/supabase/server-auth");
    vi.mocked(requireUserId).mockResolvedValueOnce(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: "2026-W08",
        dateIso: "2026-02-22",
        ratings: [{ itemId: "wf_commitment_focus_0", subjectCode: "focus", sourceType: "commitment", rating: "strong" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects duplicate itemIds in ratings", async () => {
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: "2026-W08",
        dateIso: "2026-02-22",
        ratings: [
          { itemId: "wf_commitment_focus_abc12345", subjectCode: "focus", sourceType: "commitment", rating: "strong" },
          { itemId: "wf_commitment_focus_abc12345", subjectCode: "habit", sourceType: "commitment", rating: "neutral" },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects duplicate subjectCodes in ratings", async () => {
    const req = new Request("http://localhost/api/check-ins/weekly-focus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: "2026-W08",
        dateIso: "2026-02-22",
        ratings: [
          { itemId: "wf_commitment_focus_abc12345", subjectCode: "focus", sourceType: "commitment", rating: "strong" },
          { itemId: "wf_commitment_habit_def67890", subjectCode: "focus", sourceType: "commitment", rating: "neutral" },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
