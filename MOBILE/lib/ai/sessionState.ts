import type { ConversationTurn, SessionState, SessionPhase, EmotionIntelBundle } from "@/lib/ai/types";

export function deriveSessionState(params: {
  history: ConversationTurn[];
  emotionIntel?: EmotionIntelBundle | null;
}): SessionState {
  const { history, emotionIntel } = params;

  const totalTurns = history.length;
  let phase: SessionPhase = "opening";

  if (totalTurns > 4) phase = "exploring";
  if (totalTurns > 10) phase = "clarifying";
  if (totalTurns > 18) phase = "deciding";
  if (totalTurns > 25) phase = "integrating";

  const lastUser = [...history].reverse().find((turn) => turn.role === "user");
  const lastEmotionKeyword =
    emotionIntel?.emotion.primaryEmotion ??
    emotionIntel?.emotion.secondaryEmotions?.[0] ??
    null;

  const currentTopic = lastUser?.content?.slice(0, 140) ?? null;

  const phaseThreshold =
    phase === "opening"
      ? 0
      : phase === "exploring"
        ? 4
        : phase === "clarifying"
          ? 10
          : phase === "deciding"
            ? 18
            : 25;

  const turnsInPhase = Math.max(0, history.length - phaseThreshold);

  return {
    phase,
    turnsInPhase,
    totalTurns,
    currentTopic,
    lastEmotionKeyword,
    inExercise: false,
    lastExerciseType: null,
  };
}

