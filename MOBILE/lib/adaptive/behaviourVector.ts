export interface BehaviourVector {
  warmthBias: number; // -1 to 1
  directnessBias: number; // -1 to 1
  curiosityBias: number; // -1 to 1
  brevityBias: number; // -1 to 1
  emotionalSensitivity: number; // 0 to 1
  lastUpdated: number;
}

export function createDefaultBehaviourVector(): BehaviourVector {
  const now = Date.now();
  return {
    warmthBias: 0,
    directnessBias: 0,
    curiosityBias: 0,
    brevityBias: 0,
    emotionalSensitivity: 0.5,
    lastUpdated: now,
  };
}

