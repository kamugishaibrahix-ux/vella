export function guessIntent(text: string): string {
  const lower = text.toLowerCase();
  if (/why|how|what should/i.test(lower)) return "question";
  if (/i feel|i'm feeling|my emotions/i.test(lower)) return "emotional_share";
  if (/can you|could you|please/i.test(lower)) return "request";
  if (/story|tell me/i.test(lower)) return "story_request";
  if (/ok|alright|yeah/i.test(lower)) return "acknowledge";
  return "general_speech";
}

