import { reportIncident } from "./reporter";
import type {
  BackupSnapshot,
  EmotionalStateSnapshot,
  HealthStateSnapshot,
} from "./backup";

export function restoreFromBackup(
  backup: BackupSnapshot | null,
  liveState: { emotionalState: EmotionalStateSnapshot; healthState: HealthStateSnapshot },
) {
  if (!backup) {
    reportIncident({
      id: "missing_backup",
      type: "BACKUP_RESTORE",
      timestamp: Date.now(),
      metadata: { message: "No backup snapshot found" },
    });
    return liveState;
  }

  return {
    ...liveState,
    emotionalState: backup.emotionalState,
    healthState: backup.healthState,
    behaviourVector: backup.behaviourVector,
    insights: backup.insights,
    relationshipMode: backup.relationshipMode,
    language: backup.language,
  };
}

