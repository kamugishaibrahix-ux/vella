/**
 * Weekly intent summary from focus items. Allowlisted phrases only. No user text.
 */

import type { WeeklyFocusItem } from "@/app/checkin/types";

const SUBJECT_TO_PHRASE: Record<string, string> = {
  smoking: "recovery",
  alcohol: "recovery",
  focus: "focus",
  habit: "discipline",
  other: "alignment",
};

/** Returns a single strategic line or null if unavailable. */
export function getWeeklyIntentSummary(items: WeeklyFocusItem[]): string | null {
  if (!items.length) return null;
  const codes = [...new Set(items.map((i) => i.subjectCode))];
  const phrases = codes
    .map((c) => SUBJECT_TO_PHRASE[c])
    .filter(Boolean);
  const unique = [...new Set(phrases)].slice(0, 2);
  if (!unique.length) return null;
  const part = unique.length === 2 ? `${unique[0]} and ${unique[1]}` : unique[0];
  return `This week we're strengthening ${part}.`;
}
