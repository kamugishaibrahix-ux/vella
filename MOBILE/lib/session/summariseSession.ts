/**
 * Deterministic session summarisation. No LLM. No free-text storage.
 * Input: session messages. Output: structured SessionSummary only.
 */

export type SessionSummary = {
  sessionId: string;
  dominantTopics: string[];
  emotionalTone: "positive" | "neutral" | "distressed";
  contradictionsDetected: boolean;
  valueAlignmentShift: boolean;
};

const TOPIC_KEYWORDS: [RegExp, string][] = [
  [/quit\s+smoking|smoking|nicotine|cigarette/i, "smoking"],
  [/alcohol|drinking|sober|abstain/i, "alcohol"],
  [/focus|concentrat|distract|productiv|procrastin/i, "focus"],
  [/anxiety|stress|overwhelm|worr|panic/i, "stress"],
  [/sleep|insomnia|tired|rest/i, "sleep"],
  [/habit|routine|consist|stick/i, "habits"],
  [/goal|commit|value|align/i, "goals"],
  [/boundary|respect|disrespect|rude/i, "boundary"],
  [/contradict|change\s+mind|went\s+back|relapse/i, "contradiction"],
];

const DISTRESS_PATTERNS = [
  /(?:feel|feeling|felt)\s+(?:really\s+)?(?:bad|terrible|hopeless|overwhelmed|anxious|depressed)/i,
  /(?:can't|cannot)\s+(?:do\s+it|anymore|keep\s+going)/i,
  /(?:want\s+to\s+)?(?:give\s+up|quit\s+everything)/i,
  /(?:no\s+one\s+understands|nobody\s+cares)/i,
];

const POSITIVE_PATTERNS = [
  /(?:feel|feeling)\s+(?:good|better|great|relieved|calm)/i,
  /(?:made\s+progress|did\s+it|stuck\s+to)/i,
  /(?:thank\s+you|thanks|helpful)/i,
];

/** Minimal message shape for summarisation (no store dependency). */
export type MessageForSummary = { role: "user" | "assistant"; content: string };

/**
 * Deterministic summarisation from session messages. No free text; only structured codes.
 */
export function summariseSession(sessionId: string, messages: MessageForSummary[]): SessionSummary {
  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content);
  const allText = userMessages.join(" ").toLowerCase();

  const topicSet = new Set<string>();
  for (const [re, code] of TOPIC_KEYWORDS) {
    if (re.test(allText)) topicSet.add(code);
  }
  const dominantTopics = Array.from(topicSet);

  let emotionalTone: SessionSummary["emotionalTone"] = "neutral";
  const distressCount = DISTRESS_PATTERNS.filter((re) => re.test(allText)).length;
  const positiveCount = POSITIVE_PATTERNS.filter((re) => re.test(allText)).length;
  if (distressCount > positiveCount + 1) {
    emotionalTone = "distressed";
  } else if (positiveCount > distressCount) {
    emotionalTone = "positive";
  }

  const contradictionsDetected = /contradict|change\s+mind|went\s+back|relapse|fell\s+off|slipped/i.test(allText);
  const valueAlignmentShift = /(?:used\s+to\s+believe|no\s+longer\s+care|values?\s+shift)/i.test(allText);

  return {
    sessionId,
    dominantTopics,
    emotionalTone,
    contradictionsDetected,
    valueAlignmentShift,
  };
}
