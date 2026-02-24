import OpenAI from "openai";
import { computePersonaHash } from "@/lib/utils/personaHash";
import type { VellaMode } from "@/lib/ai/modes";

/**
 * Timeout is required so that slow or stuck OpenAI responses do not hold the request open indefinitely.
 * Without it, a single hung connection can consume a worker and degrade availability under load.
 * Matches the 60s timeout used by the shared client in lib/ai/client.
 */
const OPENAI_TIMEOUT_MS = 60_000;

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS,
    })
  : null;

export type VellaTextCompletionContext = {
  mode: VellaMode;
};

/** Build system instruction for current mode. Not logged or stored. */
function buildModeSystemInstruction(mode: VellaMode): string {
  const modeRules: Record<VellaMode, string> = {
    vent: "Current mode: vent. Let the user express without interruption. Reflect and validate; do not problem-solve or advise unless they ask.",
    listen: "Current mode: listen. Listen actively, reflect back, and offer gentle support. Keep responses concise and warm.",
    challenge: "Current mode: challenge. Gently challenge unhelpful assumptions when appropriate. Stay respectful and supportive.",
    coach: "Current mode: coach. Offer actionable, supportive guidance. Encourage small steps and acknowledge effort.",
    crisis: "Current mode: crisis. Prioritise grounding and safety. Use calm, simple language. Do not escalate; offer presence and stability.",
  };
  return `You are Vella. ${modeRules[mode] ?? modeRules.listen}`;
}

export async function runVellaTextCompletion(
  prompt: string,
  userId?: string | null,
  context?: VellaTextCompletionContext | null
): Promise<string> {
  if (!client) {
    throw new Error("NO_OPENAI");
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] =
    context?.mode
      ? [
          { role: "system", content: buildModeSystemInstruction(context.mode) },
          { role: "user", content: prompt },
        ]
      : [{ role: "user", content: prompt }];

  const personaHash = computePersonaHash(prompt);
  console.log("[Persona:TEXT] persona hash:", personaHash);

  if (userId && personaHash) {
    const { logPromptSignature } = await import("@/lib/supabase/usage/logPromptSignature");
    void logPromptSignature(userId, personaHash, "text");
  }

  const chat = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    max_tokens: 500,
    temperature: 0.8,
  });

  let assistantMessage = chat.choices[0].message.content ?? "";
  
  // Global safeguard to prevent overlong responses
  // Persona handles intent; this clamps accidental overflow
  assistantMessage = assistantMessage.trim();
  if (assistantMessage.length > 550) {
    const targetLength = 450;
    const trimmed = assistantMessage.slice(0, targetLength);
    // Try to find the nearest sentence boundary
    const lastPeriod = trimmed.lastIndexOf(".");
    const lastExclamation = trimmed.lastIndexOf("!");
    const lastQuestion = trimmed.lastIndexOf("?");
    const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
    
    if (lastSentenceEnd > targetLength * 0.7) {
      // Use sentence boundary if it's reasonably close to target
      assistantMessage = trimmed.slice(0, lastSentenceEnd + 1) + "…";
    } else {
      // Otherwise just cut at target length
      assistantMessage = trimmed + "…";
    }
  }

  return assistantMessage;
}

