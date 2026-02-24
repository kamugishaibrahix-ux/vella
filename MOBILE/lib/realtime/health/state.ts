export interface HealthState {
  driftScore: number;
  tensionLoad: number;
  fatigue: number;
  clarity: number;
  lastUpdate: number;
}

export function createInitialHealthState(): HealthState {
  const now = Date.now();
  return {
    driftScore: 0,
    tensionLoad: 0,
    fatigue: 0,
    clarity: 1,
    lastUpdate: now,
  };
}

