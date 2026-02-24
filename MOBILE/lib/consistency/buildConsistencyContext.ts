"use server";

import { loadShortTermMemory, type ShortTermMemoryMessage } from "./loadShortTermMemory";
import { runFullAI } from "@/lib/ai/fullAI";

type ConsistencyArc = Record<string, unknown>;

export type ConsistencyContext = {
  history: ShortTermMemoryMessage[];
  arc: ConsistencyArc;
};

const EMPTY_CONTEXT: ConsistencyContext = {
  history: [],
  arc: {},
};

export async function buildConsistencyContext(
  userId: string | null,
  lastUserMessage: string,
): Promise<ConsistencyContext> {
  if (!userId) return EMPTY_CONTEXT;
  const memory = await loadShortTermMemory(userId);
  if (!memory.history.length) {
    return { history: [], arc: {} };
  }

  let arcJson: ConsistencyArc = {};
  try {
    const arc = await runFullAI({
      model: "gpt-4o-mini",
      system: "Summarise active conversation topics, emotional tone, unresolved threads. JSON only.",
      temperature: 0,
      messages: [{ role: "user", content: JSON.stringify(memory) }],
    });
    arcJson = JSON.parse(arc || "{}");
  } catch (error) {
    console.error("[buildConsistencyContext] arc parsing error", error);
    arcJson = {};
  }

  return {
    history: memory.history,
    arc: arcJson,
  };
}

