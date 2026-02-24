import { RETENTION_POLICY } from "./policy";
import { isExpired } from "./utils";
import type { EmotionalSnapshot } from "@/lib/memory/types";
import type { InsightSnapshot } from "@/lib/insights/types";
import type { MemoryInsightsSnapshot } from "@/lib/memory/types";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";

type Timestamped = { timestamp: number };

export function purgeMessages<T extends Timestamped>(messages: T[] = []): T[] {
  return messages.filter(
    (message) => !isExpired(message.timestamp, RETENTION_POLICY.messagesDays),
  );
}

export function purgeEmotionalHistory(history: EmotionalSnapshot[] = []): EmotionalSnapshot[] {
  return history.filter((entry) => {
    const stamp = entry.createdAt ? Date.parse(entry.createdAt) : NaN;
    return !isExpired(Number.isNaN(stamp) ? Date.now() : stamp, RETENTION_POLICY.emotionalHistoryDays);
  });
}

export function purgeInsights(
  insights: InsightSnapshot | MemoryInsightsSnapshot | null | undefined,
) {
  if (!insights) return null;
  const normalized = normalizeInsightsShape(insights);
  return isExpired(normalized.lastComputed, RETENTION_POLICY.insightsDays)
    ? null
    : normalized;
}

export function purgeBehaviourVector(vector: BehaviourVector | null | undefined) {
  if (!vector) return null;
  return isExpired(vector.lastUpdated, RETENTION_POLICY.behaviourVectorDays) ? null : vector;
}

function normalizeInsightsShape(
  insights: InsightSnapshot | MemoryInsightsSnapshot,
): MemoryInsightsSnapshot {
  if ("items" in insights) {
    const patterns = insights.patterns ?? insights.items ?? [];
    const lastComputed = insights.lastComputed ?? Date.now();
    const mode = insights.mode ?? (insights.fallback ? "lite" : "ai");
    return {
      ...insights,
      mode,
      lastComputed,
      patterns,
      items: insights.items ?? patterns,
      insights: insights.insights ?? patterns,
    };
  }

  const patterns = insights.patterns ?? [];
  const lastComputed = insights.lastComputed ?? Date.now();
  const fallback = insights.fallback ?? insights.mode === "lite";
  const mode = insights.mode ?? (fallback ? "lite" : "ai");

  return {
    items: patterns,
    patterns,
    insights: patterns,
    mode,
    fallback,
    lastComputed,
  };
}

export function purgeAuditLogs<T extends Timestamped>(logs: T[] = []): T[] {
  return logs.filter((log) => !isExpired(log.timestamp, RETENTION_POLICY.auditLogDays));
}

