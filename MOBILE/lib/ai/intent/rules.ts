const normalise = (text: string): string => text.toLowerCase().trim();

function matchesAny(text: string, keywords: (string | RegExp)[]): boolean {
  if (!text) return false;
  const normalised = normalise(text);
  return keywords.some((keyword) => {
    if (typeof keyword === "string") {
      return normalised.includes(keyword);
    }
    return keyword.test(normalised);
  });
}

const SMALLTALK_KEYWORDS: (string | RegExp)[] = [
  "what's up",
  "whats up",
  "sup",
  "wyd",
  "you up",
  "what are you doing",
  "how was your day",
  "how's your day",
  "hows your day",
  "how was your night",
  "did you miss me",
  "tell me something funny",
  /(?:what|wut)\s+do\s+you\s+think/,
  /(?:talk|chat)\s+to\s+me/,
];

const GREETING_KEYWORDS: (string | RegExp)[] = [
  /^hi\b/,
  /^hey\b/,
  /^hello\b/,
  "good morning",
  "good night",
  "good afternoon",
  "good evening",
  "hola",
  "yo",
  "hiya",
];

const PHILOSOPHY_KEYWORDS: (string | RegExp)[] = [
  "meaning of life",
  "life meaning",
  "purpose of life",
  "why am i here",
  "existential",
  "philosophy",
  "philosophical",
  "stoic",
  "stoicism",
  "metaphysical",
  "what is reality",
  "who am i",
  "identity crisis",
];

const JOKE_KEYWORDS: (string | RegExp)[] = [
  "joke",
  "funny",
  "make me laugh",
  "lol",
  "lmao",
  "rofl",
  "haha",
  "hehe",
  "meme",
  /tell me .*joke/,
];

const DEEP_FEELING_KEYWORDS: (string | RegExp)[] = [
  "heartbroken",
  "anxious",
  "anxiety",
  "depressed",
  "depression",
  "panic",
  "panic attack",
  "overwhelmed",
  "i can't breathe",
  "i cant breathe",
  "numb",
  "empty",
  "alone",
  "lonely",
  "ashamed",
  "guilty",
  "in pain",
  "hurting",
];

const META_KEYWORDS: (string | RegExp)[] = [
  "are you real",
  "are you ai",
  "are you a bot",
  "system prompt",
  "who built you",
  "how do you work",
  "are you conscious",
  "do you have feelings",
  "what are your rules",
  /are you (even\s+)?listening/,
];

export function matchesSmalltalk(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const dayCheck =
    lower.includes("how was your day") ||
    lower.includes("how's your day") ||
    lower.includes("hows your day") ||
    lower.includes("how is your day") ||
    lower.includes("how has your day been");
  if (dayCheck) return true;
  return matchesAny(lower, SMALLTALK_KEYWORDS);
}

export function matchesGreeting(text: string): boolean {
  return matchesAny(text, GREETING_KEYWORDS);
}

export function matchesPhilosophy(text: string): boolean {
  return matchesAny(text, PHILOSOPHY_KEYWORDS);
}

export function matchesJoke(text: string): boolean {
  return matchesAny(text, JOKE_KEYWORDS);
}

export function matchesDeepFeeling(text: string): boolean {
  return matchesAny(text, DEEP_FEELING_KEYWORDS);
}

export function matchesMeta(text: string): boolean {
  return matchesAny(text, META_KEYWORDS);
}

