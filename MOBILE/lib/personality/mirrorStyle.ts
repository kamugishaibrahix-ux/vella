"use server";

import { runFullAI } from "@/lib/ai/fullAI";
import type { PersonalityProfile } from "./getPersonalityProfile";

type MirroredStyle = {
  tone?: string;
  pacing?: string;
  formality?: string;
};

const DEFAULT_STYLE: MirroredStyle = {
  tone: "neutral",
  pacing: "medium",
  formality: "casual",
};

export async function mirrorStyle(
  userText: string,
  personality: PersonalityProfile,
): Promise<MirroredStyle> {
  if (!userText) return DEFAULT_STYLE;
  try {
    const result = await runFullAI({
      model: "gpt-4o-mini",
      system: `
Analyse the user's tone, pacing, and formality.
Output JSON: {tone, pacing, formality}.
No explanation.
`.trim(),
      temperature: 0,
      context: { personality },
      messages: [{ role: "user", content: userText }],
    });
    if (!result) return DEFAULT_STYLE;
    const parsed = JSON.parse(result) as MirroredStyle;
    return {
      tone: parsed.tone ?? DEFAULT_STYLE.tone,
      pacing: parsed.pacing ?? DEFAULT_STYLE.pacing,
      formality: parsed.formality ?? DEFAULT_STYLE.formality,
    };
  } catch (error) {
    console.error("[mirrorStyle] error", error);
    return DEFAULT_STYLE;
  }
}

