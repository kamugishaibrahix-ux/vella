const EMOTION_KEYWORDS = [
  "i feel",
  "i'm feeling",
  "im feeling",
  "i am feeling",
  "anxious",
  "anxiety",
  "overwhelmed",
  "scared",
  "afraid",
  "insecure",
  "sad",
  "depressed",
  "lonely",
  "angry",
  "upset",
  "hurt",
  "jealous",
  "abandoned",
  "rejected",
  "panic",
];

export function isEmotionHeavy(input: string): boolean {
  const text = input.toLowerCase();
  if (text.length < 15) return false;
  return EMOTION_KEYWORDS.some((kw) => text.includes(kw));
}

