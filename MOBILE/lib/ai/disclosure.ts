export type DisclosureIntent = "emotional" | "reflective" | "practical" | "casual";

export type DisclosureAnalysis = {
  score: number;
  intent: DisclosureIntent;
};

const EMOTION_WORDS = [
  "anxious",
  "anxiety",
  "sad",
  "depressed",
  "empty",
  "lonely",
  "tired",
  "burnt out",
  "overwhelmed",
  "stressed",
  "angry",
  "afraid",
  "scared",
  "lost",
  "confused",
  "numb",
  "hurt",
  "guilty",
  "ashamed",
  "worthless",
  "hopeless",
  "panic",
];

const PRACTICAL_REGEX = /how do i|what should i|can you help|explain|steps to|what's the best/i;

export function analyzeDisclosure(text: string): DisclosureAnalysis {
  if (!text) {
    return { score: 0, intent: "casual" };
  }

  const lower = text.toLowerCase();
  const length = lower.split(/\s+/).filter(Boolean).length;

  let emotionalHits = 0;
  for (const word of EMOTION_WORDS) {
    if (lower.includes(word)) {
      emotionalHits++;
    }
  }

  let score = 0;
  if (length > 8) score += 0.15;
  if (length > 20) score += 0.2;
  if (emotionalHits > 0) score += 0.3;
  if (emotionalHits > 2) score += 0.2;
  score = Math.max(0, Math.min(1, score));

  let intent: DisclosureIntent = "casual";
  if (score >= 0.6) {
    intent = "emotional";
  } else if (score >= 0.3) {
    intent = "reflective";
  } else if (PRACTICAL_REGEX.test(lower)) {
    intent = "practical";
  }

  return { score, intent };
}

