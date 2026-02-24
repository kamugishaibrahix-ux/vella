import type { IntentType } from "./types";
import {
  matchesDeepFeeling,
  matchesGreeting,
  matchesJoke,
  matchesMeta,
  matchesPhilosophy,
  matchesSmalltalk,
} from "./rules";
import { classifyIntentWithLLM } from "./classifier";

export async function determineIntent(latestMessage: string): Promise<IntentType> {
  const text = latestMessage?.trim();
  if (!text) {
    return "UNKNOWN";
  }

  if (matchesGreeting(text) || matchesSmalltalk(text)) return "SMALLTALK";
  if (matchesJoke(text)) return "PLAYFUL";
  if (matchesMeta(text)) return "META_REFLECTION";
  if (matchesPhilosophy(text)) return "PHILOSOPHY";
  if (matchesDeepFeeling(text)) return "EMOTIONAL_SUPPORT";

  return classifyIntentWithLLM(text);
}

export type { IntentType } from "./types";

