export type IncidentType =
  | "STATE_CORRUPTION"
  | "MISSING_MEMORY"
  | "HEALTH_OVERLOAD"
  | "LLM_FAILURE"
  | "AUDIO_FAILURE"
  | "STABILITY_DRIFT"
  | "BACKUP_RESTORE";

export interface IncidentRecord {
  id: string;
  type: IncidentType;
  timestamp: number;
  metadata: Record<string, any>;
}

