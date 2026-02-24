import type { RealtimeRuntimeSnapshot } from "./runtimeMonitor";

export function analyzeDrift(snapshot: RealtimeRuntimeSnapshot): number {
  let score = 0;

  if (snapshot.avgDeltaLength < 4) score += 20;
  if (snapshot.avgDeltaLength > 80) score += 15;
  if (snapshot.lastStage === "thinking") score += 10;
  if (snapshot.emotionArc === "flat") score += 15;

  return score;
}

