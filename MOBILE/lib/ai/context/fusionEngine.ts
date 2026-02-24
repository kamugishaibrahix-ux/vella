import type { ContextBundle } from "./contextBundle";

export function fuseContext(bundle: ContextBundle): string {
  const ctxLines: string[] = [];
  ctxLines.push(`User intent: ${bundle.responsePlan.intent}`);
  ctxLines.push(`Emotional goal: ${bundle.responsePlan.emotionalGoal}`);
  ctxLines.push(`Relationship mode: ${bundle.relationshipMode}`);
  ctxLines.push(
    `Emotion state: valence=${bundle.emotionalState.valence.toFixed(2)}, arousal=${bundle.emotionalState.arousal.toFixed(
      2,
    )}, warmth=${bundle.emotionalState.warmth.toFixed(2)}, tension=${bundle.emotionalState.tension.toFixed(2)}`,
  );
  ctxLines.push(
    `Health state: drift=${bundle.healthState.driftScore.toFixed(2)}, fatigue=${bundle.healthState.fatigue.toFixed(2)}, clarity=${bundle.healthState.clarity.toFixed(
      2,
    )}`,
  );
  if (bundle.musicMode) {
    ctxLines.push(`Suggested ambience: ${bundle.musicMode}`);
  }
  if (bundle.memorySnapshot) {
    ctxLines.push("Memory continuity active.");
  }
  if (bundle.insights?.patterns?.length) {
    ctxLines.push(
      "Active patterns:",
      ...bundle.insights.patterns.map((pattern) => `- ${pattern.label}`),
    );
  }
  return ctxLines.join("\n");
}

