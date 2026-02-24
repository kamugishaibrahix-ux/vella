import type { EmotionalState } from "@/lib/realtime/emotion/state";
import type { RelationshipMode } from "@/lib/realtime/emotion/state";
import type { InsightSnapshot } from "@/lib/insights/types";
import type { ResponsePlan } from "./responseTemplate";
import { selectDialogueStrategy } from "@/lib/dialogue/strategyEngine";

type StrategyIntent =
  | "ask_followup"
  | "offer_reflection"
  | "give_clarity"
  | "summarise"
  | "lighten_tone"
  | "probe_gently"
  | "shift_topic"
  | "stay_brief";

const RELATIONSHIP_STRATEGY_BIASES: Partial<Record<RelationshipMode, StrategyIntent[]>> = {
  best_friend: ["ask_followup", "offer_reflection", "lighten_tone"],
  mentor: ["give_clarity", "summarise", "stay_brief"],
  big_sister: ["probe_gently", "offer_reflection", "give_clarity"],
  little_sister: ["ask_followup", "probe_gently", "lighten_tone"],
  partner_soft: ["offer_reflection", "lighten_tone", "stay_brief"],
  partner_playful: ["lighten_tone", "shift_topic", "ask_followup"],
};

export function planResponse(
  userText: string,
  emotionalState: EmotionalState,
  relationshipMode: RelationshipMode,
  insights?: InsightSnapshot | null,
): ResponsePlan {
  const strategy = selectDialogueStrategy({
    emotionalState,
    relationshipMode,
    insights,
    userText,
  });
  const biasList = RELATIONSHIP_STRATEGY_BIASES[relationshipMode];
  let selectedIntent = strategy.strategy as StrategyIntent;
  if (biasList && !biasList.includes(selectedIntent)) {
    selectedIntent = biasList[0]!;
  }

  const plan: ResponsePlan = {
    intent: selectedIntent,
    emotionalGoal: emotionalState.valence < 0 ? "comfort" : "engage",
    keyPoints: [],
    narrativeFlow: [],
  };

  switch (relationshipMode) {
    case "mentor":
      plan.narrativeFlow.push("Offer guidance.");
      plan.narrativeFlow.push("Provide a grounded next step.");
      break;
    case "best_friend":
      plan.narrativeFlow.push("Relate warmly to the user.");
      plan.narrativeFlow.push("Keep it natural and honest.");
      break;
    case "big_sister":
      plan.narrativeFlow.push("Protect the user with gentle reality checks.");
      plan.narrativeFlow.push("Mix warmth with clear, caring direction.");
      break;
    case "little_sister":
      plan.narrativeFlow.push("Stay curious and playful while being supportive.");
      plan.narrativeFlow.push("Use light humour to keep the tone gentle.");
      break;
    case "partner_soft":
      plan.narrativeFlow.push("Lean into soft comfort and emotional reassurance.");
      plan.narrativeFlow.push("Keep pacing slow, warm, and calming.");
      break;
    case "partner_playful":
      plan.narrativeFlow.push("Add playful energy and gentle teasing.");
      plan.narrativeFlow.push("Help the user shift energy without losing empathy.");
      break;
    default:
      plan.narrativeFlow.push("Stay adaptive to the user's current mode.");
      break;
  }

  if (emotionalState.tension > 0.6) {
    plan.narrativeFlow.push("Reassure calmly.");
  }

  switch (plan.intent) {
    case "ask_followup":
      plan.narrativeFlow.push("Ask a natural follow-up question.");
      break;
    case "offer_reflection":
      plan.narrativeFlow.push("Reflect the user's emotional content.");
      break;
    case "give_clarity":
      plan.narrativeFlow.push("Provide clear, stabilising insight.");
      break;
    case "summarise":
      plan.narrativeFlow.push("Summarise recent patterns briefly.");
      break;
    case "lighten_tone":
      plan.narrativeFlow.push("Add a soft, warming line.");
      break;
    case "probe_gently":
      plan.narrativeFlow.push("Ask a gentle, non-intrusive probe.");
      break;
    case "shift_topic":
      plan.narrativeFlow.push("Offer a soft topic shift.");
      break;
    case "stay_brief":
    default:
      plan.narrativeFlow.push("Keep response concise and simple.");
      break;
  }

  if (userText?.trim()) {
    plan.keyPoints.push(userText.trim());
  }

  return plan;
}

