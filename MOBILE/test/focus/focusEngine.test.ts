/**
 * Weekly Focus Engine tests.
 * Deterministic output, allowlisted labels/reasons only, no user text.
 */
import { describe, it, expect } from "vitest";
import { getISOWeekId } from "@/lib/focus/weekId";
import {
  suggestWeeklyFocusItems,
  WEEKLY_FOCUS_REASON_CODES,
  WEEKLY_FOCUS_SOURCE_TYPES,
  type SuggestWeeklyFocusInput,
} from "@/lib/focus/focusEngine";
import { FOCUS_LABEL_BY_SUBJECT } from "@/lib/focus/templates";

function baseInput(): SuggestWeeklyFocusInput {
  return {
    governance: {
      riskScore: 2,
      escalationLevel: 0,
      recoveryState: "ok",
      disciplineState: "on_track",
      focusState: "active",
    },
    violationCounts7d: {
      commitmentViolations: 0,
      abstinenceViolations: 0,
      commitmentCompleted: 2,
    },
    contradictionDetected: false,
    contradictedCommitmentIds: [],
    activeCommitments: [],
    focusSessionsLast7d: 3,
  };
}

describe("suggestWeeklyFocusItems", () => {
  it("returns deterministic output for fixed input", () => {
    const input = baseInput();
    const a = suggestWeeklyFocusItems(input);
    const b = suggestWeeklyFocusItems(input);
    expect(a).toEqual(b);
  });

  it("returns at most 5 items", () => {
    const input: SuggestWeeklyFocusInput = {
      ...baseInput(),
      activeCommitments: [
        { id: "c1", subject_code: "smoking", created_at: "2026-01-01T00:00:00Z" },
        { id: "c2", subject_code: "alcohol", created_at: "2026-01-01T00:00:00Z" },
        { id: "c3", subject_code: "focus", created_at: "2026-01-01T00:00:00Z" },
        { id: "c4", subject_code: "habit", created_at: "2026-01-01T00:00:00Z" },
        { id: "c5", subject_code: "other", created_at: "2026-01-01T00:00:00Z" },
        { id: "c6", subject_code: "other", created_at: "2026-01-02T00:00:00Z" },
      ],
      valueAlignmentSignals: {
        misalignmentDetected: true,
        misalignedValues: ["discipline"],
        alignedValues: [],
        reasons: ["DISCIPLINE_VIOLATION"],
      },
      boundarySeverity: 1,
    };
    const items = suggestWeeklyFocusItems(input);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it("labels come from allowlist mapping only", () => {
    const allowlistLabels = new Set(Object.values(FOCUS_LABEL_BY_SUBJECT));
    allowlistLabels.add("Weekly focus other"); // fallback format
    const input: SuggestWeeklyFocusInput = {
      ...baseInput(),
      activeCommitments: [
        { id: "c1", subject_code: "smoking", created_at: "2026-01-01T00:00:00Z" },
        { id: "c2", subject_code: "focus", created_at: "2026-01-01T00:00:00Z" },
      ],
    };
    const items = suggestWeeklyFocusItems(input);
    for (const item of items) {
      expect(allowlistLabels.has(item.label) || item.label.startsWith("Weekly focus ")).toBe(true);
    }
  });

  it("reasons are from allowlist only", () => {
    const allowlistReasons = new Set(WEEKLY_FOCUS_REASON_CODES);
    const input: SuggestWeeklyFocusInput = {
      ...baseInput(),
      activeCommitments: [{ id: "c1", subject_code: "smoking", created_at: "2026-01-01T00:00:00Z" }],
      contradictionDetected: true,
      contradictedCommitmentIds: ["c1"],
      violationCounts7d: { commitmentViolations: 1, abstinenceViolations: 0, commitmentCompleted: 0 },
    };
    const items = suggestWeeklyFocusItems(input);
    for (const item of items) {
      for (const r of item.reasons) {
        expect(allowlistReasons.has(r)).toBe(true);
      }
    }
  });

  it("sourceType is from allowlist only", () => {
    const allowlistSources = new Set(WEEKLY_FOCUS_SOURCE_TYPES);
    const input: SuggestWeeklyFocusInput = {
      ...baseInput(),
      activeCommitments: [{ id: "c1", subject_code: "alcohol", created_at: "2026-01-01T00:00:00Z" }],
      focusSessionsLast7d: 0,
      governance: { ...baseInput().governance, focusState: "idle" },
      valueAlignmentSignals: {
        misalignmentDetected: true,
        misalignedValues: ["health"],
        alignedValues: [],
        reasons: [],
      },
      boundarySeverity: 1,
    };
    const items = suggestWeeklyFocusItems(input);
    for (const item of items) {
      expect(allowlistSources.has(item.sourceType)).toBe(true);
    }
  });

  it("no user text in input or output", () => {
    const input = baseInput();
    const items = suggestWeeklyFocusItems(input);
    const outputJson = JSON.stringify(items);
    expect(outputJson).not.toMatch(/\b(userMessage|content|note|summary|narrative|free_text)\b/i);
    expect(input).not.toHaveProperty("userMessage");
    expect(input).not.toHaveProperty("freeText");
  });

  it("empty activeCommitments and no signals yields empty or minimal list", () => {
    const input = baseInput();
    const items = suggestWeeklyFocusItems(input);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it("contradiction raises priority and adds CONTRADICTION reason", () => {
    const input: SuggestWeeklyFocusInput = {
      ...baseInput(),
      activeCommitments: [{ id: "cx", subject_code: "smoking", created_at: "2026-01-01T00:00:00Z" }],
      contradictionDetected: true,
      contradictedCommitmentIds: ["cx"],
    };
    const items = suggestWeeklyFocusItems(input);
    const smokingItem = items.find((i) => i.subjectCode === "smoking" && i.sourceType === "commitment");
    expect(smokingItem).toBeDefined();
    expect(smokingItem!.reasons).toContain("CONTRADICTION");
    expect(smokingItem!.priority).toBeGreaterThanOrEqual(2);
  });

  it("itemId is code-safe (alphanumeric, underscore, hyphen)", () => {
    const input: SuggestWeeklyFocusInput = {
      ...baseInput(),
      activeCommitments: [{ id: "a1b2c3d4-e5f6-7890", subject_code: "focus", created_at: "2026-01-01T00:00:00Z" }],
    };
    const items = suggestWeeklyFocusItems(input);
    for (const item of items) {
      expect(item.itemId).toMatch(/^wf_[a-z0-9_-]+$/);
    }
  });
});

describe("getISOWeekId", () => {
  it("returns YYYY-Www format", () => {
    const id = getISOWeekId(new Date("2026-02-22"));
    expect(id).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("is deterministic for same date", () => {
    const d = new Date("2026-01-15");
    expect(getISOWeekId(d)).toBe(getISOWeekId(d));
  });
});
