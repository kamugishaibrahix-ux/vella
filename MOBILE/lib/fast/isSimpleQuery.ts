export function isSimpleQuery(text: string | null | undefined): boolean {
  if (!text) return false;
  const simple = [
    "time",
    "weather",
    "date",
    "who are you",
    "hi",
    "hello",
    "thanks",
    "thank you",
    "how are you",
    "what's up",
    "whats up",
  ];
  const lowered = text.toLowerCase().trim();
  if (!lowered) return false;
  return simple.some((entry) => lowered.includes(entry));
}

