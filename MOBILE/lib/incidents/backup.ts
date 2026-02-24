import type { EmotionalState } from "@/lib/realtime/emotion/state";
import type { HealthState } from "@/lib/realtime/health/state";

export type EmotionalStateSnapshot = EmotionalState;
export type HealthStateSnapshot = HealthState;

export interface BackupSnapshot {
  timestamp: number;
  emotionalState: EmotionalStateSnapshot;
  healthState: HealthStateSnapshot;
  behaviourVector: unknown;
  insights: unknown;
  relationshipMode: string;
  language: string;
}

export function createBackupSnapshot(context: {
  emotionalState: EmotionalStateSnapshot;
  healthState: HealthStateSnapshot;
  behaviourVector: unknown;
  insights: unknown;
  relationshipMode: string;
  language: string;
}): BackupSnapshot {
  return {
    timestamp: Date.now(),
    emotionalState: context.emotionalState,
    healthState: context.healthState,
    behaviourVector: context.behaviourVector,
    insights: context.insights,
    relationshipMode: context.relationshipMode,
    language: context.language,
  };
}

