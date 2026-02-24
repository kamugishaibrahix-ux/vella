import type { BehaviourVector } from "./behaviourVector";

interface SessionStats {
  avgValence: number;
  avgTension: number;
  avgCuriosity: number;
  avgMessageLength: number;
  userAsksDeepQuestions: boolean;
}

export function updateBehaviourVector(
  prev: BehaviourVector,
  sessionStats: SessionStats,
): BehaviourVector {
  const now = Date.now();
  const next: BehaviourVector = { ...prev, lastUpdated: now };

  if (sessionStats.avgTension > 0.5) {
    next.emotionalSensitivity = Math.min(1, next.emotionalSensitivity + 0.05);
  }

  if (sessionStats.userAsksDeepQuestions) {
    next.curiosityBias = Math.min(1, next.curiosityBias + 0.03);
  }

  if (sessionStats.avgMessageLength < 40) {
    next.brevityBias = Math.min(1, next.brevityBias + 0.03);
  }

  if (sessionStats.avgValence > 0.2) {
    next.warmthBias = Math.min(1, next.warmthBias + 0.02);
  }

  return next;
}

