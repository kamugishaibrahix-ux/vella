import { openai, model } from "@/lib/ai/client";
import type { IntentType } from "./types";

const INTENT_VALUES: IntentType[] = [
  "SMALLTALK",
  "EMOTIONAL_SUPPORT",
  "PHILOSOPHY",
  "META_REFLECTION",
  "PLAYFUL",
  "UNKNOWN",
];

type IntentClassifierResponse = {
  intent: IntentType;
};

function parseIntentResponse(raw: string | null | undefined): IntentType {
  if (!raw) return "UNKNOWN";
  try {
    const parsed = JSON.parse(raw) as IntentClassifierResponse;
    if (INTENT_VALUES.includes(parsed.intent)) {
      return parsed.intent;
    }
  } catch {
    // fall through
  }
  return "UNKNOWN";
}

export async function classifyIntentWithLLM(message: string): Promise<IntentType> {
  if (!message?.trim()) {
    return "UNKNOWN";
  }

  if (!openai) {
    return "UNKNOWN";
  }

  const systemPrompt = `
You are an intent classifier for the Vella companion.
Read the latest user message and categorise it into one of:
- SMALLTALK (light small talk, greetings, jokes, casual banter)
- EMOTIONAL_SUPPORT (the user is sharing heavy feelings or asking for help with emotions)
- PHILOSOPHY (user asks about meaning, purpose, existential topics)
- META_REFLECTION (user asking about the AI, the system, or how it works)
- PLAYFUL (user prompts for humour or teasing tone)
- UNKNOWN (anything else)

Respond ONLY with JSON: { "intent": "..." } and no extra words.
`;

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "";
  return parseIntentResponse(content);
}

