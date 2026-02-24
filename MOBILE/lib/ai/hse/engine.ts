import type { MemoryProfile } from "@/lib/memory/types";
import { openai, model } from "../client";
import { type HSEState, DEFAULT_HSE_STATE, deriveNextHSEState } from "./state";
import { buildCasualPersonaEnvelope, buildCasualReplyStyleHint } from "./templates";

export interface CasualEngineResult {
  reply: string;
  nextState: HSEState;
}

export async function generateCasualReply(
  userMessage: string,
  profile: MemoryProfile,
  prevState: HSEState = DEFAULT_HSE_STATE,
): Promise<CasualEngineResult> {
  const intent: "casual" | "emotional" | "deep" | "unknown" = "casual";
  const nextState = deriveNextHSEState(prevState, { intent, userMessage, profile });

  const systemPersona = buildCasualPersonaEnvelope(nextState, profile);
  const styleHint = buildCasualReplyStyleHint(nextState);

  const systemPrompt = [
    systemPersona,
    "Respond in a single, natural-sounding message.",
    "Do not over-explain. This is small talk, not a session.",
    styleHint,
  ].join(" ");

  if (!openai) {
    return {
      reply: "I'd love to swap stories, but my conversation engine is offline for a moment.",
      nextState,
    };
  }

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.6,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const replyText =
    completion.choices[0]?.message?.content?.trim() ??
    "I'm here, just rummaging through cloud thoughts. What's on your mind?";

  return {
    reply: replyText,
    nextState,
  };
}

