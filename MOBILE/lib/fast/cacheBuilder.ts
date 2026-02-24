"use server";

import { getEmotionalPatterns } from "@/lib/patterns/getEmotionalPatterns";
import { getLifeThemes } from "@/lib/themes/getLifeThemes";
import { getBehaviourLoops } from "@/lib/loops/getBehaviourLoops";
import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import { listGoals } from "@/lib/goals/goalEngine";

export async function buildMicroRagCache(userId: string) {
  if (!userId) {
    throw new Error("[buildMicroRagCache] userId is required");
  }

  const [lastPatterns, lastThemes, lastLoops, lastTraits, lastDistortions, lifeGoals, focusGoals] =
    await Promise.all([
      getEmotionalPatterns(userId),
      getLifeThemes(userId),
      getBehaviourLoops(userId),
      getUserTraits(userId),
      getCognitiveDistortions(userId),
      listGoals(userId, "life"),
      listGoals(userId, "focus"),
    ]);

  return {
    lastPatterns,
    lastThemes,
    lastLoops,
    lastTraits,
    lastDistortions,
    lastGoals: {
      life: lifeGoals,
      focus: focusGoals,
    },
  };
}

