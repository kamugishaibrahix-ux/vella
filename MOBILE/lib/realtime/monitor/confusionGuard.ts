export function detectConfusion(text: string): boolean {
  if (!text) return false;

  if (/(\b\w+\b)\s+\1/i.test(text)) return true;
  if (text.length < 3) return true;

  return false;
}

