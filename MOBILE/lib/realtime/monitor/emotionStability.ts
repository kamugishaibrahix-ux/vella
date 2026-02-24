import type { RealtimeRuntimeSnapshot } from "./runtimeMonitor";

export function regulateEmotion(snapshot: RealtimeRuntimeSnapshot): string {
  if (snapshot.emotionArc === "peak" && snapshot.driftScore > 50) {
    return "soften-tone";
  }
  if (snapshot.emotionArc === "neutral" && snapshot.driftScore < 10) {
    return "enrich-tone";
  }
  return "stable";
}

