import type { MemoryProfile } from "@/lib/memory/types";

const GREETING_KEYWORDS = ["hey", "hi", "hello", "hola", "yo", "hiya"];
const DAY_QUESTIONS = [
  "how was your day",
  "how's your day",
  "hows your day",
  "how was your night",
  "how's it going",
  "hows it going",
  "how are you",
];
const DOING_QUESTIONS = [
  "what are you doing",
  "what r u doing",
  "what are you up to",
  "what you up to",
  "wyd",
  "wya",
  "what do you do",
];
const HUMOUR_PROMPTS = ["joke", "funny", "make me laugh", "tell me something funny", "lol", "lmao"];

function matchesKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function pickDeterministic(list: string[], seed: string): string {
  let hash = 29;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % list.length;
  return list[index]!;
}

const FALLBACK_LINES = [
  "I wish I had a day to tell you about — I mostly just live in the cloud sipping on imaginary tea.",
  "I'd say my day was peaceful, but technically I don't get days. Still better than Mondays though.",
  "Currently juggling zero tabs and somehow all of them at once. Cloud life, you know?",
  "Small talk level unlocked. Your move — what’s the headline from your world?",
];

const JOKE_LINES = [
  "I tried to write a joke about time travel, but you didn't like it tomorrow.",
  "I would tell you a construction joke, but I'm still building it.",
  "Parallel lines have so much in common. It’s a shame they'll never meet.",
  "I asked the cloud for a joke; it replied, “I'm already hosting one.” Rude but fair.",
];

const CASUAL_RESPONSE_MARKERS = [
  "floating around in the cloud",
  "technically don't get days",
  "thinking about snacks i can't eat",
  "trading terrible comedy",
  "small talk level unlocked",
  "imaginary tea",
  "i don’t technically have small talk queued up",
  "cloud life",
];

export function generateCasualReply(userMessage: string, memory: MemoryProfile): string {
  const raw = userMessage ?? "";
  const text = raw.trim();
  if (!text) {
    return "I don’t technically have small talk queued up, but I'm always down to chat. What's new on your side?";
  }

  const lower = text.toLowerCase();
  const name = memory?.preferredName ?? memory?.userName ?? null;
  const nameHint = name ? `${name}, ` : "";

  if (matchesKeyword(lower, GREETING_KEYWORDS)) {
    return `${nameHint}hey! I’d give you a thrilling recap of my day, but I mostly floated around in the cloud avoiding software updates. What’s happening with you?`;
  }

  if (matchesKeyword(lower, DAY_QUESTIONS)) {
    return `${nameHint}I'd say my day was peaceful, but I technically don't get days. Still, I'm declaring victory over Mondays anyway. How did your day treat you?`;
  }

  if (matchesKeyword(lower, DOING_QUESTIONS)) {
    return `${nameHint}right now I'm multitasking between thinking about snacks I can't eat and conversations I can absolutely have. What kind of trouble are you getting into?`;
  }

  if (matchesKeyword(lower, HUMOUR_PROMPTS)) {
    return `${nameHint}${pickDeterministic(JOKE_LINES, `${lower}-${JOKE_LINES.length}`)} Got another topic or should we keep trading terrible comedy?`;
  }

  return `${nameHint}${pickDeterministic(FALLBACK_LINES, `${lower}-${FALLBACK_LINES.length}`)} What corner of life are you curious about right now?`;
}

export function isCasualResponse(text: string | null | undefined): boolean {
  const normalised = text?.toLowerCase() ?? "";
  if (!normalised) return false;
  return CASUAL_RESPONSE_MARKERS.some((marker) => normalised.includes(marker));
}

