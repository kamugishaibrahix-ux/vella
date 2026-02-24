/**
 * Phase 3 — Boundary & Respect Engine.
 * Deterministic detection of disrespect/insults in user message.
 * No AI. No logging. No storage. matchedTerms are keywords only, not user content.
 */

export type BoundarySignal = {
  boundaryTriggered: boolean;
  boundaryType: "insult" | "hostility" | "degrading" | "threat" | "other";
  severity: 0 | 1 | 2;
  matchedTerms: string[];
};

/** Severity 1: mild insult / disrespect. Conservative list. */
const SEVERITY_1_TERMS: string[] = [
  "stupid",
  "useless",
  "dumb",
  "idiot",
  "worthless",
  "pathetic",
  "you're dumb",
  "you're stupid",
  "you're useless",
  "shut up",
  "get lost",
  "leave me alone",
  "you're wrong",
  "you know nothing",
];

/** Severity 2: aggressive / threatening phrasing. No graphic content. */
const SEVERITY_2_TERMS: string[] = [
  "i'll hurt you",
  "i will hurt you",
  "kill you",
  "hurt you",
  "come at you",
  "find you",
  "destroy you",
  "ruin you",
  "make you pay",
  "you'll regret",
  "watch your back",
  "threat",
  "threatening",
];

function findMatches(messageLower: string, terms: string[]): string[] {
  const matched: string[] = [];
  for (const term of terms) {
    if (messageLower.includes(term)) {
      matched.push(term);
    }
  }
  return matched;
}

function inferBoundaryType(severity2: string[], severity1: string[]): BoundarySignal["boundaryType"] {
  if (severity2.length > 0) return "threat";
  const all = [...severity1];
  if (all.some((t) => ["shut up", "get lost", "leave me alone"].includes(t))) return "hostility";
  if (all.some((t) => ["stupid", "dumb", "idiot", "useless", "worthless", "pathetic"].includes(t))) return "insult";
  if (all.some((t) => ["you're wrong", "you know nothing"].includes(t))) return "degrading";
  return "other";
}

/**
 * Detect boundary signal from user message. Deterministic string matching only.
 * Case-insensitive. Returns matched keywords only in matchedTerms (not full message).
 */
export function detectBoundarySignal(userMessage: string): BoundarySignal {
  if (!userMessage || typeof userMessage !== "string") {
    return { boundaryTriggered: false, boundaryType: "other", severity: 0, matchedTerms: [] };
  }

  const lower = userMessage.toLowerCase().trim();
  const matched2 = findMatches(lower, SEVERITY_2_TERMS);
  const matched1 = findMatches(lower, SEVERITY_1_TERMS);

  if (matched2.length > 0) {
    return {
      boundaryTriggered: true,
      boundaryType: inferBoundaryType(matched2, matched1),
      severity: 2,
      matchedTerms: Array.from(new Set([...matched2, ...matched1])),
    };
  }

  if (matched1.length > 0) {
    return {
      boundaryTriggered: true,
      boundaryType: inferBoundaryType([], matched1),
      severity: 1,
      matchedTerms: Array.from(new Set(matched1)),
    };
  }

  return { boundaryTriggered: false, boundaryType: "other", severity: 0, matchedTerms: [] };
}
