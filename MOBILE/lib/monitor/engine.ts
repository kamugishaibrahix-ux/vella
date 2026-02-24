import type { MonitoringSnapshot } from "./types";

export interface MonitoringTurn {
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
}

interface MonitoringInput {
  emotionalState: { valence: number; arousal: number; tension: number };
  healthState: { driftScore: number; clarity: number };
  deliveryMeta?: {
    deliveryHints?: {
      targetRate?: number | null;
      targetSoftness?: number | null;
    };
  };
  responsePlan: { intent: string };
  relationshipMode: string;
  recentTurns: MonitoringTurn[];
}

const minutesBetween = (start?: number, end?: number) => {
  if (!start || !end) return 0;
  return Math.max(0, end - start) / 60000;
};

export function computeMonitoringSnapshot({
  emotionalState,
  healthState,
  deliveryMeta,
  responsePlan,
  relationshipMode,
  recentTurns,
}: MonitoringInput): MonitoringSnapshot {
  const timestamp = Date.now();
  const userTurns = recentTurns.filter((turn) => turn.role === "user");
  const assistantTurns = recentTurns.filter((turn) => turn.role === "assistant");

  const avgTurnLength =
    userTurns.length === 0
      ? 0
      : userTurns.reduce((sum, turn) => sum + turn.text.length, 0) / userTurns.length;

  const firstTurn = recentTurns[0]?.timestamp ?? timestamp;
  const lastTurn = recentTurns[recentTurns.length - 1]?.timestamp ?? timestamp;
  const elapsedMinutes = Math.max(1 / 60, minutesBetween(firstTurn, lastTurn));
  const turnPerMinute = recentTurns.length / elapsedMinutes;

  const rapidFireTurns = userTurns.filter((turn, index) => {
    const prev = userTurns[index - 1];
    if (!prev?.timestamp || !turn.timestamp) return false;
    return minutesBetween(prev.timestamp, turn.timestamp) < 0.25;
  }).length;

  const shortAssistantReplies = assistantTurns.filter((turn) => turn.text.length < 40).length;

  const rateHint = deliveryMeta && "deliveryHints" in deliveryMeta ? deliveryMeta.deliveryHints : undefined;
  const targetRate = rateHint?.targetRate ?? 0.5;
  const targetSoftness = rateHint?.targetSoftness ?? 0.5;

  const driftScore =
    (healthState.driftScore ?? 0) * 0.6 +
    (rapidFireTurns > 3 ? 0.2 : 0) +
    (Math.abs(emotionalState.valence) > 0.7 ? 0.1 : 0) +
    (targetRate > 0.8 ? 0.1 : 0);

  const clarityScore = Math.max(
    0,
    Math.min(
      1,
      1 -
        (shortAssistantReplies / Math.max(1, assistantTurns.length)) * 0.3 -
        rapidFireTurns * 0.05 -
        (healthState.clarity < 0.5 ? 0.2 : 0),
    ),
  );

  const fatigueLevel = Math.max(
    0,
    Math.min(
      1,
      (turnPerMinute / 12) * 0.3 +
        (minutesBetween(firstTurn, timestamp) / 30) * 0.4 +
        (targetSoftness < 0.4 ? 0.2 : 0) +
        (healthState.driftScore > 6 ? 0.2 : 0),
    ),
  );

  const riskLevel =
    emotionalState.tension * 0.35 +
    driftScore * 0.35 +
    (clarityScore < 0.5 ? 0.2 : 0) +
    (fatigueLevel > 0.6 ? 0.1 : 0);

  return {
    timestamp,
    valence: emotionalState.valence,
    arousal: emotionalState.arousal,
    tension: emotionalState.tension,
    tensionLoad: emotionalState.tension,
    driftScore,
    clarity: clarityScore,
    avgTurnLength,
    turnPerMinute,
    strategy: responsePlan.intent,
    relationshipMode,
    riskLevel,
    fatigueLevel,
  };
}

