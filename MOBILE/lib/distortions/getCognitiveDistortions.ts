"use server";

import {
  detectCognitiveDistortions,
  type CognitiveDistortion,
} from "@/lib/insights/cognitiveDistortions";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";

export type DetailedDistortion = CognitiveDistortion & {
  frequency?: number;
  severity?: number;
  relatedThemes?: string[];
  relatedLoops?: string[];
};

export async function getCognitiveDistortions(userId: string | null): Promise<CognitiveDistortion[]> {
  if (!userId) return [];
  try {
    return await detectCognitiveDistortions(userId);
  } catch (error) {
    console.error("[getCognitiveDistortions] error", error);
    return [];
  }
}

export async function getCognitiveDistortionsDetailed(
  userId: string | null,
): Promise<DetailedDistortion[]> {
  if (!userId) return [];
  try {
    const [distortions, themes, loops] = await Promise.all([
      detectCognitiveDistortions(userId),
      getLifeThemes(userId),
      getBehaviourLoops(userId),
    ]);
    return distortions.map((distortion, index) => ({
      ...distortion,
      frequency: Math.max(1, distortion.examples.length || index + 1),
      severity: estimateSeverity(distortion.type),
      relatedThemes: findRelated(distortion.explanation, themes.map((theme) => theme.theme)),
      relatedLoops: findRelated(distortion.explanation, loops.map((loop) => loop.loop)),
    }));
  } catch (error) {
    console.error("[getCognitiveDistortionsDetailed] error", error);
    return [];
  }
}

function estimateSeverity(type: string): number {
  const lower = type.toLowerCase();
  if (lower.includes("catastroph") || lower.includes("mind")) return 80;
  if (lower.includes("overgeneral")) return 70;
  return 60;
}

function findRelated(explanation: string, candidates: string[]): string[] {
  const lower = explanation.toLowerCase();
  return candidates
    .filter((candidate) => lower.includes(candidate.toLowerCase()))
    .slice(0, 3);
}

