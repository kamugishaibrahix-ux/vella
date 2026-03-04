import { openai, model } from "@/lib/ai/client";
import type { PlanTier } from "@/lib/tiers/tierCheck";
import type { ConversationMessage } from "./conversation";
import { getDefaultEntitlements } from "@/lib/plans/defaultEntitlements";

type SummariseParams = {
  userId: string;
  planTier: PlanTier;
  messages: ConversationMessage[];
};

export async function summariseMessages(params: SummariseParams): Promise<string | null> {
  const { userId, planTier, messages } = params;
  const _ent = getDefaultEntitlements(planTier);
  if (!userId || !_ent.enableDeepDive || !messages.length || !openai) {
    return null;
  }

  const trimmed = messages
    .slice(0, 50)
    .reverse()
    .map((msg) => `${msg.role === "assistant" ? "Vella" : "User"}: ${msg.content}`);

  if (trimmed.length === 0) return null;

  try {
    const tokenCost = 0;

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are Vella's conversation archivist. Summarize the conversation thread into 4-5 sentences highlighting emotional arcs, open threads, and any commitments. Keep it neutral, supportive, and factual.",
        },
        {
          role: "user",
          content: trimmed.join("\n"),
        },
      ],
    });

    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    // silent fallback
    return null;
  }
}

