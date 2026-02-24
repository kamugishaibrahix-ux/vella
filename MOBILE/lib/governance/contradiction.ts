/**
 * Phase 2 — Commitment Contradiction Engine.
 * Deterministic rule-based detection when user message conflicts with active commitment subject.
 * No AI. No free text. No writes.
 */

/** Subject code → keywords indicating reversal/contradiction. Case-insensitive word-boundary style. */
const SUBJECT_KEYWORDS: Record<string, string[]> = {
  smoking: ["smoke", "smoking", "cigarette", "relapse"],
  alcohol: ["drink", "drinking", "alcohol", "beer", "wine", "relapse", "sobriety"],
  focus: ["skip", "procrastinate", "delay", "avoid work", "put off"],
  habit: ["skip", "break streak", "quit"],
  other: ["skip", "quit", "give up"],
};

/**
 * Detect if user message contradicts any active commitment by subject.
 * Deterministic string matching only. No AI. No regex overreach.
 */
export function detectCommitmentContradiction(
  userMessage: string,
  activeCommitments: { id: string; subject_code: string | null }[]
): { contradictionDetected: boolean; contradictedCommitmentIds: string[] } {
  if (activeCommitments.length === 0) {
    return { contradictionDetected: false, contradictedCommitmentIds: [] };
  }

  const lower = userMessage.toLowerCase().trim();
  const contradictedIds: string[] = [];

  for (const c of activeCommitments) {
    const code = c.subject_code?.toLowerCase() ?? "other";
    const keywords = SUBJECT_KEYWORDS[code] ?? SUBJECT_KEYWORDS.other;
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        contradictedIds.push(c.id);
        break;
      }
    }
  }

  return {
    contradictionDetected: contradictedIds.length > 0,
    contradictedCommitmentIds: Array.from(new Set(contradictedIds)),
  };
}
