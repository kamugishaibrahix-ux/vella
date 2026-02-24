"use server";

import { runFullAI } from "@/lib/ai/fullAI";

export async function detectOverload(text: string | null | undefined): Promise<number> {
  if (!text) return 0;
  try {
    const result = await runFullAI({
      model: "gpt-4o-mini",
      system:
        "Detect cognitive overload, mental fatigue, burnout signals in user text. Output JSON {overload: 0-1}. No explanation.",
      temperature: 0,
      messages: [{ role: "user", content: text }],
    });
    if (!result) return 0;
    const parsed = JSON.parse(result) as { overload?: number };
    return clamp(parsed.overload ?? 0);
  } catch (error) {
    console.error("[detectOverload] error", error);
    return 0;
  }
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

