"use server";

import { getUserTraits } from "@/lib/traits/adaptiveTraits";
import { listGoals } from "@/lib/goals/goalEngine";
import { extractLifeThemes } from "@/lib/insights/lifeThemes";
import { detectCognitiveDistortions } from "@/lib/insights/cognitiveDistortions";
import { callVellaReflectionAPI } from "@/lib/ai/reflection";

export type StoicContext = {
  userId: string;
  topic: string;
  moodHint?: string;
};

export type StoicPrincipleKey =
  | "dichotomy_of_control"
  | "amor_fati"
  | "memento_mori"
  | "virtue_first"
  | "present_focus"
  | "acceptance"
  | "discipline_over_feelings";

export type StoicAdvice = {
  principle: StoicPrincipleKey;
  principleLabel: string;
  summary: string;
  reframe: string;
  suggestedPractices: string[];
};

const FALLBACK_ADVICE: StoicAdvice = {
  principle: "dichotomy_of_control",
  principleLabel: "Dichotomy of Control",
  summary: "Focus on what you can influence and release what you cannot.",
  reframe: "This challenge is an invitation to concentrate on your own actions, not the outcome.",
  suggestedPractices: ["List what is in your control vs out of your control", "Take one action on the controllable side"],
};

export async function getStoicAdvice(ctx: StoicContext): Promise<StoicAdvice> {
  try {
    const [traits, lifeGoals, focusGoals, lifeThemes, distortions] = await Promise.all([
      getUserTraits(ctx.userId),
      listGoals(ctx.userId, "life"),
      listGoals(ctx.userId, "focus"),
      extractLifeThemes(ctx.userId),
      detectCognitiveDistortions(ctx.userId),
    ]);

    const payload = {
      type: "stoic_coach" as const,
      topic: ctx.topic,
      moodHint: ctx.moodHint ?? null,
      userId: ctx.userId,
      planTier: "free" as const,
      traits,
      goals: {
        life: lifeGoals,
        focus: focusGoals,
      },
      lifeThemes,
      distortions,
    };

    const response = await callVellaReflectionAPI(payload);
    if (response.type === "ai_response") {
      const parsed = parseStoicAdvice(response.message);
      if (parsed) return parsed;
    }
  } catch (error) {
    console.error("[stoicEngine] getStoicAdvice error", error);
  }
  return FALLBACK_ADVICE;
}

function parseStoicAdvice(message: string | undefined): StoicAdvice | null {
  if (!message) return null;
  try {
    const cleaned = message.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed.principle === "string" &&
      typeof parsed.principleLabel === "string" &&
      typeof parsed.summary === "string" &&
      typeof parsed.reframe === "string" &&
      Array.isArray(parsed.suggestedPractices)
    ) {
      return {
        principle: sanitizePrinciple(parsed.principle),
        principleLabel: parsed.principleLabel,
        summary: parsed.summary,
        reframe: parsed.reframe,
        suggestedPractices: parsed.suggestedPractices.slice(0, 4),
      };
    }
  } catch (error) {
    console.error("[stoicEngine] parseStoicAdvice error", error);
  }
  return null;
}

function sanitizePrinciple(value: string): StoicPrincipleKey {
  const known: StoicPrincipleKey[] = [
    "dichotomy_of_control",
    "amor_fati",
    "memento_mori",
    "virtue_first",
    "present_focus",
    "acceptance",
    "discipline_over_feelings",
  ];
  return (known.find((key) => key === value) ?? "dichotomy_of_control") as StoicPrincipleKey;
}

