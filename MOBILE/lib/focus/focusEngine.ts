/**
 * Weekly Focus Loop — deterministic suggestion engine.
 * Uses only structured signals. No user text. No LLM.
 */

import { GOVERNANCE_SUBJECT_CODES } from "@/lib/governance/validation";
import { getFocusLabel, type FocusSubjectCode } from "./templates";

// ---------------------------------------------------------------------------
// Allowlisted reason codes (no free text)
// ---------------------------------------------------------------------------
export const WEEKLY_FOCUS_REASON_CODES = [
  "RECENT_VIOLATIONS",
  "CONTRADICTION",
  "DECLINING_TREND",
  "VALUE_MISALIGNMENT",
  "BOUNDARY_TENSION",
  "LOW_FOCUS",
] as const;

export type WeeklyFocusReasonCode = (typeof WEEKLY_FOCUS_REASON_CODES)[number];

export const WEEKLY_FOCUS_SOURCE_TYPES = ["commitment", "value", "focus", "governance"] as const;
export type WeeklyFocusSourceType = (typeof WEEKLY_FOCUS_SOURCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type WeeklyFocusItem = {
  itemId: string;
  sourceType: WeeklyFocusSourceType;
  subjectCode: FocusSubjectCode;
  label: string;
  priority: number;
  reasons: WeeklyFocusReasonCode[];
};

export type WeeklyFocusSuggestion = {
  weekId: string;
  items: WeeklyFocusItem[];
};

/** Structured input only. No user text. */
export type SuggestWeeklyFocusInput = {
  governance: {
    riskScore: number;
    escalationLevel: number;
    recoveryState: string;
    disciplineState: string;
    focusState: string;
  };
  violationCounts7d: {
    commitmentViolations: number;
    abstinenceViolations: number;
    commitmentCompleted: number;
  };
  violationCounts30d?: {
    commitmentViolations30d: number;
    abstinenceViolations30d: number;
    commitmentCompleted30d: number;
  };
  contradictionDetected: boolean;
  contradictedCommitmentIds: string[];
  boundarySeverity?: 0 | 1 | 2;
  guidanceSignals?: {
    firmnessLevel: number;
    earnedValidation: { earnedValidationLevel: number; reasons: string[] };
    outcomeProjection: { projectionLevel: number; reasons: string[] };
  };
  identitySignals?: Record<string, unknown>;
  longitudinalSignals?: {
    disciplineTrend: string;
    recoveryTrend: string;
    focusTrend: string;
    cycleDetected: boolean;
    reasons: string[];
  };
  valueAlignmentSignals?: {
    misalignmentDetected: boolean;
    misalignedValues: string[];
    reasons: string[];
  };
  activeCommitments: Array<{ id: string; subject_code: string | null; created_at: string }>;
  focusSessionsLast7d?: number;
  activeValues?: string[];
};

const MAX_ITEMS = 5;
const VALID_SUBJECT_CODES = new Set<string>(GOVERNANCE_SUBJECT_CODES);

function toSubjectCode(raw: string | null): FocusSubjectCode {
  if (raw && VALID_SUBJECT_CODES.has(raw)) return raw as FocusSubjectCode;
  return "other";
}

/** Deterministic short id for an item. Code-safe only. */
function toItemId(sourceType: WeeklyFocusSourceType, subjectCode: string, commitmentId?: string): string {
  const suffix = commitmentId ? commitmentId.slice(0, 8) : "0";
  return `wf_${sourceType}_${subjectCode}_${suffix}`;
}

/**
 * Suggests up to 5 weekly focus items from structured signals only.
 * Labels from allowlisted templates. Reasons from allowlist only.
 */
export function suggestWeeklyFocusItems(input: SuggestWeeklyFocusInput): WeeklyFocusItem[] {
  const items: WeeklyFocusItem[] = [];
  const seen = new Set<string>();

  const {
    governance,
    violationCounts7d,
    violationCounts30d,
    contradictionDetected,
    contradictedCommitmentIds,
    boundarySeverity = 0,
    longitudinalSignals,
    valueAlignmentSignals,
    activeCommitments,
    focusSessionsLast7d = 0,
  } = input;

  const hasRecentViolations =
    violationCounts7d.commitmentViolations > 0 || violationCounts7d.abstinenceViolations > 0;
  const decliningDiscipline =
    longitudinalSignals?.disciplineTrend === "declining" || longitudinalSignals?.reasons?.includes("VIOLATION_TREND_UP");
  const lowFocus = (governance.focusState === "idle" || governance.focusState === "overdue") && focusSessionsLast7d < 2;

  // 1) Items from active commitments
  for (const c of activeCommitments) {
    const subjectCode = toSubjectCode(c.subject_code);
    const itemId = toItemId("commitment", subjectCode, c.id);
    if (seen.has(itemId)) continue;
    seen.add(itemId);

    const reasons: WeeklyFocusReasonCode[] = [];
    if (contradictedCommitmentIds.includes(c.id)) reasons.push("CONTRADICTION");
    if (hasRecentViolations) reasons.push("RECENT_VIOLATIONS");
    if (decliningDiscipline) reasons.push("DECLINING_TREND");

    items.push({
      itemId,
      sourceType: "commitment",
      subjectCode,
      label: getFocusLabel(subjectCode),
      priority: reasons.includes("CONTRADICTION") ? 3 : reasons.length > 0 ? 2 : 1,
      reasons,
    });
  }

  // 2) Standalone focus item if low focus and no focus commitment
  const hasFocusCommitment = activeCommitments.some((c) => toSubjectCode(c.subject_code) === "focus");
  if (lowFocus && !hasFocusCommitment) {
    const subjectCode: FocusSubjectCode = "focus";
    const itemId = toItemId("focus", subjectCode);
    if (!seen.has(itemId)) {
      seen.add(itemId);
      items.push({
        itemId,
        sourceType: "focus",
        subjectCode,
        label: getFocusLabel(subjectCode),
        priority: 2,
        reasons: ["LOW_FOCUS"],
      });
    }
  }

  // 3) Value misalignment (single aggregate item, subject "other")
  if (valueAlignmentSignals?.misalignmentDetected && valueAlignmentSignals.misalignedValues.length > 0) {
    const itemId = toItemId("value", "other");
    if (!seen.has(itemId)) {
      seen.add(itemId);
      items.push({
        itemId,
        sourceType: "value",
        subjectCode: "other",
        label: getFocusLabel("other"),
        priority: 2,
        reasons: ["VALUE_MISALIGNMENT"],
      });
    }
  }

  // 4) Boundary tension (generic governance item)
  if (boundarySeverity >= 1) {
    const itemId = toItemId("governance", "other") + "_boundary";
    if (!seen.has(itemId)) {
      seen.add(itemId);
      items.push({
        itemId,
        sourceType: "governance",
        subjectCode: "other",
        label: getFocusLabel("other"),
        priority: 2,
        reasons: ["BOUNDARY_TENSION"],
      });
    }
  }

  // Sort: higher priority first, then by reason count
  items.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.reasons.length - a.reasons.length;
  });

  return items.slice(0, MAX_ITEMS);
}
