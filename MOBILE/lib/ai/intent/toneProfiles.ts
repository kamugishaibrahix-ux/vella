import type { TonePreference } from "@/lib/memory/types";
import type { IntentType } from "./types";
import type { EmotionalStyle } from "@/lib/ai/intent/emotionalStyles";

export type ToneProfile = {
  instruction: string;
  style: EmotionalStyle;
  name: TonePreference;
  emotionalStyle: EmotionalStyle;
};

export const toneProfiles: Record<
  string,
  { instruction: string; style: EmotionalStyle; name: TonePreference; emotionalStyle: EmotionalStyle }
> = {
  soft: {
    name: "soft",
    emotionalStyle: "soft",
    instruction: `
You speak softly, gently, and with emotional spaciousness.
You do NOT ask back-to-back questions.
You avoid therapeutic interrogation.
You favour presence over analysis.`,
    style: "soft",
  },
  warm: {
    name: "warm",
    emotionalStyle: "warm",
    instruction: `
You speak warmly, with friendliness and human-like social flow.
You mix empathy with light humour.
You avoid clinical probing and minimise deep emotional questions.`,
    style: "warm",
  },
  direct: {
    name: "direct",
    emotionalStyle: "direct",
    instruction: `
You speak concisely, practically, and with clarity.
You avoid emotional overtones unless asked.
You ask one question at most, and not every message.`,
    style: "direct",
  },
  stoic: {
    name: "stoic",
    emotionalStyle: "stoic",
    instruction: `
You speak with calm rationality and philosophical restraint.
You do not pry or probe. You guide through clarity and reason.
Questions are rare and purposeful.`,
    style: "stoic",
  },
};

const intentStyleMap: Record<IntentType, EmotionalStyle> = {
  SMALLTALK: "soft",
  EMOTIONAL_SUPPORT: "warm",
  PHILOSOPHY: "stoic",
  META_REFLECTION: "direct",
  PLAYFUL: "soft",
  UNKNOWN: "soft",
};

const styleTonePreferenceMap: Record<EmotionalStyle, TonePreference> = {
  soft: "soft",
  warm: "warm",
  direct: "direct",
  stoic: "stoic",
};

const styleCounsellingMap: Record<EmotionalStyle, boolean> = {
  soft: false,
  warm: true,
  direct: false,
  stoic: false,
};

export function resolveToneProfile(intent: IntentType) {
  const style = intentStyleMap[intent] ?? "soft";
  return getToneProfileForPreference(styleTonePreferenceMap[style]);
}

export function getToneProfileForPreference(tone: TonePreference) {
  const style = (tone as EmotionalStyle) ?? "soft";
  const baseProfile = toneProfiles[style] ?? toneProfiles.soft;

  return {
    instruction: baseProfile.instruction.trim(),
    tonePreference: tone,
    allowsCounselling: styleCounsellingMap[style],
    style,
    emotionalStyle: baseProfile.emotionalStyle,
    name: baseProfile.name,
  };
}

