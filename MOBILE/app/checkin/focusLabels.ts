/**
 * Focus label utilities
 */

const SUBJECT_LABELS: Record<string, string> = {
  "self-mastery": "Self-Mastery",
  "addiction-recovery": "Addiction Recovery",
  "relationships": "Relationships",
  "emotional-regulation": "Emotional Regulation",
  "decision-clarity": "Decision Clarity",
  "performance-focus": "Performance Focus",
  "identity-direction": "Identity Direction",
};

export function getSubjectLabel(code: string): string {
  return SUBJECT_LABELS[code] || code;
}
