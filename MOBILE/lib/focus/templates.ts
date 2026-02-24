/**
 * Allowlisted label templates for weekly focus items by subject_code.
 * No user text. Labels are code-only mappings for UI display.
 */

import { GOVERNANCE_SUBJECT_CODES } from "@/lib/governance/validation";

export type FocusSubjectCode = (typeof GOVERNANCE_SUBJECT_CODES)[number];

/** Map subject_code -> allowlisted label. Must not contain user-generated text. */
export const FOCUS_LABEL_BY_SUBJECT: Record<FocusSubjectCode, string> = {
  smoking: "No smoking",
  alcohol: "No alcohol",
  focus: "Deep work",
  habit: "Daily habit",
  other: "Weekly focus",
};

const FALLBACK_PREFIX = "Weekly focus";

/**
 * Returns allowlisted label for a subject code.
 * Fallback: "Weekly focus" + subjectCode (still allowlisted, no user text).
 */
export function getFocusLabel(subjectCode: FocusSubjectCode): string {
  return FOCUS_LABEL_BY_SUBJECT[subjectCode] ?? `${FALLBACK_PREFIX} ${subjectCode}`;
}
