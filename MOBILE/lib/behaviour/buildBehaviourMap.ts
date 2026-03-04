"use server";

import { runFullAI, resolveModelForTier } from "@/lib/ai/fullAI";
import { listJournalEntries } from "@/lib/journal/server";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { getEmotionalPatterns } from "@/lib/patterns/getEmotionalPatterns";
import { getLifeThemes } from "@/lib/insights/lifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { detectCognitiveDistortions } from "@/lib/insights/cognitiveDistortions";
import { listTraitHistory } from "@/lib/traits/listTraitHistory";

export async function buildBehaviourMap(userId: string) {
  if (!userId) return {};

  const [journals, checkins, patterns, themes, loops, distortions, traitsHistory] =
    await Promise.all([
      listJournalEntries(userId),
      getAllCheckIns(userId),
      getEmotionalPatterns(userId),
      getLifeThemes(userId),
      getBehaviourLoops(userId),
      detectCognitiveDistortions(userId),
      listTraitHistory(userId),
    ]);

  const input = {
    journals,
    checkins,
    patterns,
    themes,
    loops,
    distortions,
    traitsHistory,
  };

  try {
    const result = await runFullAI({
      model: await resolveModelForTier("elite"),
      system: `
Analyse long-term behaviour trends.
Identify:
- emotional cycles
- stress rhythm
- habit growth/decay
- long-term mood direction
- pattern seasonality
- recurring triggers
- long-term improvement areas
Output JSON only.
`.trim(),
      messages: [{ role: "user", content: JSON.stringify(input) }],
      temperature: 0.2,
    });
    return result ? JSON.parse(result) : {};
  } catch (error) {
    console.error("[buildBehaviourMap] error", error);
    return {};
  }
}

