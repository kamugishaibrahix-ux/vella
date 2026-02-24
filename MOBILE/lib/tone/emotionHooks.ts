export function detectUserEmotion(text: string): string {
  if (!text) return "neutral";
  if (/sad|down|tired|lonely|lost/i.test(text)) return "sad";
  if (/stress|overwhelm|too much/i.test(text)) return "overwhelmed";
  if (/happy|excited|great/i.test(text)) return "excited";
  return "neutral";
}

