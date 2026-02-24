"use server";

import { getBehaviourLoops, type BehaviourLoop } from "@/lib/loops/getBehaviourLoops";
import { getCognitiveDistortions } from "@/lib/distortions/getCognitiveDistortions";
import type { CognitiveDistortion } from "@/lib/insights/cognitiveDistortions";
import type { EmotionalForecast } from "@/lib/forecast/generateEmotionalForecast";
import type { TraitDelta } from "@/lib/traits/traitDeltas";

export type BehaviourRiskFlag = {
  key: string;
  label: string;
  description: string;
};

type RiskContext = {
  loops?: BehaviourLoop[];
  distortions?: CognitiveDistortion[];
  forecast?: EmotionalForecast | null;
  traitDeltas?: TraitDelta[];
};

export async function computeBehaviourRiskFlags(
  userId: string,
  context: RiskContext = {},
): Promise<BehaviourRiskFlag[]> {
  const flags: BehaviourRiskFlag[] = [];
  let loops = context.loops;
  let distortions = context.distortions;

  if (!loops) {
    loops = await getBehaviourLoops(userId);
  }
  if (!distortions) {
    distortions = await getCognitiveDistortions(userId);
  }

  const highSeverityLoop = loops?.find((loop) => (loop.severity ?? loop.frequency) >= 7);
  if (highSeverityLoop) {
    flags.push({
      key: "behaviour_cycle",
      label: "Behaviour cycle risk",
      description: `The ${highSeverityLoop.loop.toLowerCase()} loop is repeating often—plan grounding rituals around its trigger.`,
    });
  }

  if ((distortions?.length ?? 0) >= 3) {
    flags.push({
      key: "cognitive_rigidity",
      label: "Cognitive rigidity",
      description: "Multiple distortions surfaced recently—schedule a quick reframing exercise.",
    });
  }

  if (context.forecast?.next24h === "dip" || context.forecast?.next7d === "decline") {
    flags.push({
      key: "emotional_dip",
      label: "Emotional dip",
      description: "Mood trend suggests a dip—prepare calm anchors before the day ramps up.",
    });
  }

  const decliningTrait = context.traitDeltas?.find(
    (delta) => delta.label === "resilience" && delta.direction === "down",
  );
  if (decliningTrait) {
    flags.push({
      key: "resilience_dip",
      label: "Resilience dip",
      description: "Resilience drifted lower—protect recovery pockets after heavy conversations.",
    });
  }

  return flags;
}

