"use server";

import { runFullAI } from "@/lib/ai/fullAI";

export type ToneProfile = {
  warmth: number;
  softness: number;
  pacing: "short" | "balanced" | "long";
  density: "light" | "moderate" | "rich";
  formality: "casual" | "neutral" | "polished";
  linguisticStyle: "direct" | "reflective" | "poetic" | "analytical";
};

const DEFAULT_PROFILE: ToneProfile = {
  warmth: 0.55,
  softness: 0.55,
  pacing: "balanced",
  density: "moderate",
  formality: "neutral",
  linguisticStyle: "reflective",
};

export async function generateToneProfile(inputMessage: string | null | undefined): Promise<ToneProfile> {
  if (!inputMessage || !inputMessage.trim()) {
    return DEFAULT_PROFILE;
  }

  const systemPrompt = `
You analyze tone only. No advice. No reflection. No opinion.
Output JSON ONLY with keys:
{
  "warmth": number (0-1),
  "softness": number (0-1),
  "pacing": "short"|"balanced"|"long",
  "density": "light"|"moderate"|"rich",
  "formality": "casual"|"neutral"|"polished",
  "linguisticStyle": "direct"|"reflective"|"poetic"|"analytical"
}
  `.trim();

  const userPrompt = `
Message:
"""
${inputMessage}
"""

Detect tone traits and output JSON only.
`.trim();

  try {
    const response = await runFullAI({
      model: "gpt-4o-mini",
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.1,
    });
    const parsed = JSON.parse(response ?? "{}") as Partial<ToneProfile>;
    return normalizeToneProfile(parsed);
  } catch (error) {
    console.error("[generateToneProfile] error", error);
    return DEFAULT_PROFILE;
  }
}

function normalizeToneProfile(input: Partial<ToneProfile>): ToneProfile {
  return {
    warmth: clamp(input.warmth ?? DEFAULT_PROFILE.warmth),
    softness: clamp(input.softness ?? DEFAULT_PROFILE.softness),
    pacing: isValidPacing(input.pacing) ? input.pacing : DEFAULT_PROFILE.pacing,
    density: isValidDensity(input.density) ? input.density : DEFAULT_PROFILE.density,
    formality: isValidFormality(input.formality) ? input.formality : DEFAULT_PROFILE.formality,
    linguisticStyle: isValidStyle(input.linguisticStyle) ? input.linguisticStyle : DEFAULT_PROFILE.linguisticStyle,
  };
}

function clamp(value: number, min = 0, max = 1) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function isValidPacing(value: unknown): value is ToneProfile["pacing"] {
  return value === "short" || value === "balanced" || value === "long";
}

function isValidDensity(value: unknown): value is ToneProfile["density"] {
  return value === "light" || value === "moderate" || value === "rich";
}

function isValidFormality(value: unknown): value is ToneProfile["formality"] {
  return value === "casual" || value === "neutral" || value === "polished";
}

function isValidStyle(value: unknown): value is ToneProfile["linguisticStyle"] {
  return value === "direct" || value === "reflective" || value === "poetic" || value === "analytical";
}

