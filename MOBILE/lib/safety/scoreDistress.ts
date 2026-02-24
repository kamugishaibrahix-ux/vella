"use server";

import { runFullAI } from "@/lib/ai/fullAI";
import { loadRuntimeTuning } from "@/lib/admin/runtimeTuning";

export async function scoreDistress(text: string | null | undefined): Promise<number> {
  if (!text) return 0;
  try {
    // Load admin safety tuning
    const tuning = await loadRuntimeTuning().catch(() => null);
    const redFlagSensitivity = tuning ? tuning.safety.redFlagSensitivity / 100 : 0.76;
    const emotionalWeighting = tuning ? tuning.memory.emotionalWeighting / 100 : 0.52;
    
    const result = await runFullAI({
      model: "gpt-4o-mini",
      system: "Score emotional distress from 0 to 1. Output JSON {score}. No explanation.",
      temperature: 0,
      messages: [{ role: "user", content: text }],
    });
    if (!result) return 0;
    const parsed = JSON.parse(result) as { score?: number };
    const rawScore = typeof parsed.score === "number" ? parsed.score : 0;
    
    // Scale score by admin red flag sensitivity (higher sensitivity = higher scores)
    const scaledScore = rawScore * (0.5 + redFlagSensitivity * 0.5);
    
    // Apply emotional weighting: scale the influence of emotion scores
    // Higher emotionalWeighting = emotion scores have more influence
    const finalScore = scaledScore * (0.5 + emotionalWeighting * 0.5);
    
    return clampScore(finalScore);
  } catch (error) {
    console.error("[scoreDistress] error", error);
    return 0;
  }
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

