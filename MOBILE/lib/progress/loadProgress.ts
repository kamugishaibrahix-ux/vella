"use server";

import { serverLocalGet } from "@/lib/local/serverLocal";
import type { ConnectionProgressWithMeta } from "./types";

type ProgressRow = {
  consistency_score?: number;
  emotional_openness?: number;
  improvement_score?: number;
  stability_score?: number;
  connection_index?: number;
  updated_at?: string | null;
};

const DEFAULT_PROGRESS: ConnectionProgressWithMeta = {
  consistencyScore: 0,
  emotionalOpenness: 0,
  improvementScore: 0,
  stabilityScore: 0,
  connectionIndex: 0,
  updatedAt: null,
};

export async function loadProgress(userId: string | null): Promise<ConnectionProgressWithMeta> {
  if (!userId) {
    return DEFAULT_PROGRESS;
  }

  try {
    const data = await serverLocalGet(`progress_metrics:${userId}`);
    const row = (data ?? null) as ProgressRow | null;
    if (!row) {
      return DEFAULT_PROGRESS;
    }

    return {
      consistencyScore: row.consistency_score ?? 0,
      emotionalOpenness: row.emotional_openness ?? 0,
      improvementScore: row.improvement_score ?? 0,
      stabilityScore: row.stability_score ?? 0,
      connectionIndex: row.connection_index ?? 0,
      updatedAt: row.updated_at ?? null,
    };
  } catch (error) {
    console.warn("[progress] loadProgress error", error);
    return DEFAULT_PROGRESS;
  }
}

