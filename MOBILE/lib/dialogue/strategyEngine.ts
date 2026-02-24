import type { EmotionalState } from "@/lib/realtime/emotion/state";
import type { InsightSnapshot } from "@/lib/insights/types";
import type { DialogueDecision } from "./types";

export function selectDialogueStrategy({
  emotionalState,
  relationshipMode,
  insights,
  userText,
}: {
  emotionalState: EmotionalState;
  relationshipMode: string;
  insights?: InsightSnapshot | null;
  userText: string;
}): DialogueDecision {
  const val = emotionalState.valence;
  const tension = emotionalState.tension;
  const arousal = emotionalState.arousal;

  if (tension > 0.6) {
    return { strategy: "offer_reflection", reason: "High tension detected" };
  }

  if (val < -0.25) {
    return { strategy: "give_clarity", reason: "Negative valence detected" };
  }

  if (val > 0.4 && arousal > 0.5) {
    return { strategy: "ask_followup", reason: "Positive and energized" };
  }

  if (insights?.patterns?.length) {
    return { strategy: "summarise", reason: "Recurring pattern detected" };
  }

  if ((userText ?? "").trim().length < 8) {
    return { strategy: "probe_gently", reason: "Short or unclear text" };
  }

  return { strategy: "stay_brief", reason: "Default safe strategy" };
}

