const CRISIS_KEYWORDS = [
  "can't do this",
  "overwhelmed",
  "panic",
  "breaking down",
  "hurt myself",
  "end it",
  "suicide",
  "kill myself",
  "self harm",
  "self-harm",
  "can't cope",
  "cannot cope",
  "i'm falling apart",
];

export function detectDistress(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some((keyword) => lower.includes(keyword));
}

