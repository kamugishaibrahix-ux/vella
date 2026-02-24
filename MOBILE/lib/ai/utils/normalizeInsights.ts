import type { MemoryProfile, MemoryInsightsSnapshot } from "@/lib/memory/types";
import type { InsightSnapshot } from "@/lib/insights/types";

/**
 * Normalizes legacy memory insight payloads into the InsightSnapshot shape
 * expected by downstream realtime + persona modules.
 */
export function normalizeInsightSnapshot(
  insights: MemoryProfile["insights"],
): InsightSnapshot | null {
  if (!insights) {
    return null;
  }

  if ("patterns" in (insights as InsightSnapshot)) {
    return insights as InsightSnapshot;
  }

  if ("items" in (insights as MemoryInsightsSnapshot)) {
    const legacy = insights as MemoryInsightsSnapshot;
    return {
      patterns: legacy.patterns ?? legacy.items ?? [],
      lastComputed: legacy.lastComputed ?? Date.now(),
      mode: legacy.mode ?? "lite",
      fallback: true,
      notes: [],
    };
  }

  return null;
}

