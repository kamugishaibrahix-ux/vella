export interface MonitoringSnapshot {
  timestamp: number;
  valence: number;
  arousal: number;
  tension: number;
  tensionLoad: number;
  driftScore: number;
  clarity: number;
  avgTurnLength: number;
  turnPerMinute: number;
  strategy: string;
  relationshipMode: string;
  riskLevel: number;
  fatigueLevel: number;
}

