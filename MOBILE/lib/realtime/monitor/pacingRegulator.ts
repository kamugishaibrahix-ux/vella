import type { RealtimeRuntimeSnapshot } from "./runtimeMonitor";

export function regulatePacing(snapshot: RealtimeRuntimeSnapshot): string {
  if (snapshot.avgDeltaLength < 5) {
    return "increase-pauses";
  }
  if (snapshot.avgDeltaLength > 100) {
    return "tighten-pauses";
  }
  return "ok";
}

