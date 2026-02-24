const CASUAL_KEYWORDS = [
  "hey",
  "hi",
  "hello",
  "sup",
  "what's up",
  "whats up",
  "how's it going",
  "hows it going",
  "wyd",
  "what are you doing",
  "what r u doing",
  "what are you up to",
  "what you up to",
  "what do you think",
  "tell me something funny",
  "tell me a joke",
  "joke",
  "lol",
  "lmao",
  "haha",
  "hehe",
  "rofl",
  "bored",
  "talk to me",
  "entertain me",
  "say something sarcastic",
  "good morning",
  "wyd?",
  "good night",
  "did you miss me",
];

const FORCE_CASUAL_PHRASES = [
  "how was your day",
  "how's your day",
  "hows your day",
  "how was your night",
  "what's up",
  "whats up",
  "hi",
  "hello",
  "hey",
  "lol",
  "tell me something funny",
  "say something sarcastic",
  "what do you think",
  "good morning",
  "wyd",
  "wyd?",
  "good night",
  "did you miss me",
];

const EMOTIONAL_KEYWORDS = [
  "sad",
  "upset",
  "anxious",
  "anxiety",
  "stressed",
  "stress",
  "depressed",
  "depression",
  "overwhelmed",
  "angry",
  "furious",
  "lonely",
  "hurt",
  "afraid",
  "scared",
  "panic",
  "burned out",
  "burnt out",
  "worried",
  "worry",
  "heartbroken",
  "crying",
];

const DEEP_KEYWORDS = [
  "purpose",
  "meaning of life",
  "meaning",
  "philosophy",
  "philosophical",
  "existential",
  "what is life",
  "who am i",
  "identity",
  "belonging",
  "why am i here",
  "what should i do",
  "life choices",
  "life choice",
  "morality",
  "ethics",
];

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function containsExplicitEmotionalLanguage(userMessage: string): boolean {
  const normalised = userMessage?.toLowerCase().trim() ?? "";
  if (!normalised) return false;
  return matchesAny(normalised, EMOTIONAL_KEYWORDS);
}

export function detectIntentType(
  userMessage: string,
): "casual" | "emotional" | "deep" | "unknown" {
  const normalised = userMessage?.toLowerCase().trim() ?? "";
  if (!normalised) return "unknown";

  const forceCasual = matchesAny(normalised, FORCE_CASUAL_PHRASES);
  if (forceCasual) return "casual";

  const isDeep = matchesAny(normalised, DEEP_KEYWORDS);
  if (isDeep) return "deep";

  const isEmotional = matchesAny(normalised, EMOTIONAL_KEYWORDS);
  if (isEmotional) return "emotional";

  const isCasual = matchesAny(normalised, CASUAL_KEYWORDS);
  if (isCasual) return "casual";

  return "unknown";
}

