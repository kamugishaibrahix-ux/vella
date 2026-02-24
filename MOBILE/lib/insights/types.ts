export interface BehaviourPattern {
  id: string;
  label: string;
  description: string;
  evidenceMessages: string[];
  lastUpdated: number;
  fallback?: boolean;
  mode?: "ai" | "lite";
}

export interface InsightSnapshot {
  patterns: BehaviourPattern[];
  lastComputed: number;
  mode?: "ai" | "lite";
  fallback?: boolean;
  notes?: string[];
  liteInsights?: string[];
}
export type InsightKind = "today" | "pattern" | "identity" | "action" | "upgrade" | "lite";

export type InsightCardData = {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  moodTag?: string;
  action?: string;
  quote?: string;
  author?: string;
  type?: "lite";
  message?: string;
  note?: string;
};

