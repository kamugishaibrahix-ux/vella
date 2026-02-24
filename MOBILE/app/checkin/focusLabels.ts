/**
 * Client-safe subject code → label for weekly focus review.
 * Mirrors allowlisted labels from lib/focus/templates (no server import).
 */

export const SUBJECT_LABEL_BY_CODE: Record<string, string> = {
  smoking: "No smoking",
  alcohol: "No alcohol",
  focus: "Deep work",
  habit: "Daily habit",
  other: "Weekly focus",
};

export function getSubjectLabel(subjectCode: string | null): string {
  if (!subjectCode) return "—";
  return SUBJECT_LABEL_BY_CODE[subjectCode] ?? subjectCode;
}
