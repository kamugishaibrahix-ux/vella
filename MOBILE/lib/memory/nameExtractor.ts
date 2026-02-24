export function extractNameFromText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  const patterns = [
    /my name is ([A-Za-z]+)/i,
    /i am ([A-Za-z]+)/i,
    /i'm ([A-Za-z]+)/i,
    /call me ([A-Za-z]+)/i,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

