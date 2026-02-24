export type DialogueStrategy =
  | "ask_followup"
  | "offer_reflection"
  | "give_clarity"
  | "summarise"
  | "lighten_tone"
  | "probe_gently"
  | "shift_topic"
  | "stay_brief";

export interface DialogueDecision {
  strategy: DialogueStrategy;
  reason: string;
}

