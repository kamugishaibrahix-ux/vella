"use server";

import {
  detectBehaviourLoops,
  type BehaviourLoop as RawBehaviourLoop,
} from "@/lib/insights/behaviourLoops";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";

export type BehaviourLoop = RawBehaviourLoop & {
  trigger?: string;
  thought?: string;
  behaviour?: string;
  consequence?: string;
  severity?: number;
  relatedThemes?: string[];
  relatedDistortions?: string[];
};

export async function getBehaviourLoops(userId: string | null): Promise<BehaviourLoop[]> {
  if (!userId) return [];
  try {
    const [loops, themes, distortions] = await Promise.all([
      detectBehaviourLoops(userId),
      getLifeThemes(userId),
      getCognitiveDistortions(userId),
    ]);
    
    // Normalize loops to ensure it's always an array
    let loopsArray: any[] = [];
    if (Array.isArray(loops)) {
      loopsArray = loops;
    } else if (loops && Array.isArray((loops as any).loops)) {
      loopsArray = (loops as any).loops;
    } else {
      // silent fallback
      loopsArray = [];
    }
    
    return loopsArray.map((loop) => enrichLoop(loop, themes, distortions));
  } catch (error) {
    // silent fallback
    return [];
  }
}

function enrichLoop(
  loop: RawBehaviourLoop,
  themes: { theme: string }[],
  distortions: { type: string }[],
): BehaviourLoop {
  const relatedThemes = themes
    .filter((theme) => loop.description.toLowerCase().includes(theme.theme.toLowerCase()))
    .slice(0, 2)
    .map((theme) => theme.theme);

  const relatedDistortions = distortions
    .filter((dist) => loop.description.toLowerCase().includes(dist.type.toLowerCase()))
    .slice(0, 2)
    .map((dist) => dist.type);

  return {
    ...loop,
    trigger: deriveTrigger(loop.loop),
    thought: deriveThought(loop.loop),
    behaviour: deriveBehaviour(loop.loop),
    consequence: deriveConsequence(loop.loop),
    severity: deriveSeverity(loop.frequency),
    relatedThemes,
    relatedDistortions,
  };
}

function deriveTrigger(loopName: string): string {
  const lower = loopName.toLowerCase();
  if (lower.includes("anxiety")) return "Evening anxiety spike or late-night messages";
  if (lower.includes("burnout")) return "Overworking mid-week without recovery";
  if (lower.includes("overthinking")) return "Ambiguous outcomes and decision pressure";
  return "Stress or uncertainty that feels hard to control";
}

function deriveThought(loopName: string): string {
  const lower = loopName.toLowerCase();
  if (lower.includes("anxiety")) return "If I don’t figure this out tonight it’ll fall apart";
  if (lower.includes("burnout")) return "I have to keep pushing or everything slips";
  if (lower.includes("overthinking")) return "There must be one perfect answer if I think long enough";
  return "I need to fix this right now even if I’m exhausted";
}

function deriveBehaviour(loopName: string): string {
  const lower = loopName.toLowerCase();
  if (lower.includes("anxiety")) return "Scroll, ruminate, and re-read conversations";
  if (lower.includes("burnout")) return "Sprint hard, skip breaks, crash later";
  if (lower.includes("overthinking")) return "Collect more data instead of acting";
  return "Delay action while trying to manage feelings alone";
}

function deriveConsequence(loopName: string): string {
  const lower = loopName.toLowerCase();
  if (lower.includes("anxiety")) return "Sleep disruption and next-day energy dips";
  if (lower.includes("burnout")) return "Energy crash, more avoidance later";
  if (lower.includes("overthinking")) return "Decisions stall and confidence drops";
  return "Feels stuck and reinforces self-doubt";
}

function deriveSeverity(frequency: number): number {
  if (frequency >= 7) return 9;
  if (frequency >= 5) return 7;
  if (frequency >= 3) return 5;
  return 3;
}

