/**
 * Focus label utilities
 */

const SUBJECT_LABELS: Record<string, string> = {
  "self-mastery": "Self-Mastery",
  "addiction-recovery": "Addiction Recovery",
  "emotional-intelligence": "Emotional Intelligence",
  "relationships": "Relationships",
  "performance-focus": "Performance & Focus",
  "identity-purpose": "Identity & Purpose",
  "physical-health": "Physical Health & Energy",
  "financial-discipline": "Financial Discipline",
  // Legacy mappings for backwards compatibility
  "emotional-regulation": "Emotional Intelligence",
  "decision-clarity": "Emotional Intelligence",
  "identity-direction": "Identity & Purpose",
};

export function getSubjectLabel(code: string): string {
  return SUBJECT_LABELS[code] || code;
}
