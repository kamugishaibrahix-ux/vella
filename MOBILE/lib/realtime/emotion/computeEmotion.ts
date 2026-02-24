import type { EmotionalState } from "./state";

const POSITIVE_WORDS = [
  "grateful",
  "happy",
  "excited",
  "calm",
  "relieved",
  "hopeful",
  "love",
  "loved",
  "optimistic",
  "energised",
];

const NEGATIVE_WORDS = [
  "sad",
  "worried",
  "anxious",
  "tired",
  "angry",
  "upset",
  "stressed",
  "afraid",
  "lonely",
  "frustrated",
];

const QUESTION_WORDS = ["why", "how", "what", "where", "when", "who"];

const clamp = (value: number, min = -1, max = 1) => Math.min(max, Math.max(min, value));

export function computeEmotion(text: string): EmotionalState {
  const normalized = text?.toLowerCase?.() ?? "";
  const tokens = normalized.match(/[a-z']+/g) ?? [];
  const totalTokens = tokens.length || 1;

  const positiveHits = tokens.filter((word) => POSITIVE_WORDS.includes(word)).length;
  const negativeHits = tokens.filter((word) => NEGATIVE_WORDS.includes(word)).length;
  const questionHits = tokens.filter((word) => QUESTION_WORDS.includes(word)).length;
  const exclamationHits = (text.match(/!/g) ?? []).length;

  const valence = clamp((positiveHits - negativeHits) / Math.max(positiveHits + negativeHits, 1));
  const arousal = clamp(Math.min(1, totalTokens / 80) + exclamationHits * 0.1, 0, 1);
  const tension = clamp(negativeHits / totalTokens + exclamationHits * 0.05, 0, 1);
  const warmth = clamp(0.2 + positiveHits / totalTokens);
  const curiosity = clamp(questionHits / totalTokens + 0.1);

  return {
    valence,
    arousal,
    tension,
    warmth,
    curiosity,
    lastUpdate: Date.now(),
  };
}

