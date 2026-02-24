import type { MemoryProfile } from "@/lib/memory/types";

export type VellaMood = "warm" | "playful" | "stoic" | "direct" | "witty" | "serious";

export type HumourStyle = "dry" | "light" | "chaotic" | "stoic-wry";

export interface HSEState {
  mood: VellaMood;
  energy: "low" | "medium" | "high";
  humour: HumourStyle;
  lastUserIntent: "casual" | "emotional" | "deep" | "unknown";
  lastUserMessageSnippet: string | null;
}

export const DEFAULT_HSE_STATE: HSEState = {
  mood: "warm",
  energy: "medium",
  humour: "stoic-wry",
  lastUserIntent: "unknown",
  lastUserMessageSnippet: null,
};

export function deriveNextHSEState(
  prev: HSEState,
  params: {
    intent: "casual" | "emotional" | "deep" | "unknown";
    userMessage: string;
    profile: MemoryProfile;
  },
): HSEState {
  const base: HSEState = {
    ...prev,
    lastUserIntent: params.intent,
    lastUserMessageSnippet: params.userMessage.slice(0, 160),
  };

  // Very simple first pass: adjust mood/energy by intent.
  if (params.intent === "casual") {
    return {
      ...base,
      mood: "playful",
      energy: "medium",
      humour: "dry",
    };
  }

  if (params.intent === "emotional") {
    return {
      ...base,
      mood: "warm",
      energy: "low",
      humour: "light",
    };
  }

  if (params.intent === "deep") {
    return {
      ...base,
      mood: "stoic",
      energy: "medium",
      humour: "stoic-wry",
    };
  }

  return base;
}

