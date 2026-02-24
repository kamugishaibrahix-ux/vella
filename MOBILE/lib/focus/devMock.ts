/**
 * Development-only mock for Weekly Focus UI.
 * Use when NEXT_PUBLIC_DEV_FOCUS_MOCK=true or API fails in dev.
 * Does not run in production. No user text. Deterministic.
 */

import type { FocusWeekResponse } from "@/app/checkin/types";

export function getDevMockWeeklyFocus(weekId: string): FocusWeekResponse {
  return {
    weekId,
    items: [
      {
        itemId: "wf_commitment_smoking_a1",
        sourceType: "commitment",
        subjectCode: "smoking",
        label: "No smoking",
        priority: 1,
        reasons: ["RECENT_VIOLATIONS"],
      },
      {
        itemId: "wf_focus_deepwork_b2",
        sourceType: "focus",
        subjectCode: "focus",
        label: "Deep work",
        priority: 2,
        reasons: ["LOW_FOCUS"],
      },
      {
        itemId: "wf_value_habit_c3",
        sourceType: "value",
        subjectCode: "habit",
        label: "Daily habit",
        priority: 3,
        reasons: ["VALUE_MISALIGNMENT"],
      },
    ],
  };
}
