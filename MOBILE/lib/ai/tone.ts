import type { TonePreference } from "@/lib/memory/types";

export type ToneConfig = {
  key: TonePreference;
  label: string;
  description: string;
};

export const TONE_CONFIGS: ToneConfig[] = [
  {
    key: "soft",
    label: "Soft",
    description: "Grounded, gentle, and slow. More space between ideas, less analysis.",
  },
  {
    key: "warm",
    label: "Warm",
    description: "Emotionally validating, encouraging, and lightly humorous.",
  },
  {
    key: "direct",
    label: "Direct",
    description: "Clear, concise, to the point. Still kind but with minimal cushioning.",
  },
  {
    key: "stoic",
    label: "Stoic",
    description: "Structured, philosophical, focused on perspective, control, and discipline.",
  },
];

export function getToneInstruction(tone: TonePreference): string {
  switch (tone) {
    case "soft":
      return `
Tone mode: SOFT.
- Speak slowly and simply.
- Prioritise safety and regulation over problem solving.
- Use fewer words and longer silences in between ideas.
- Ask very gentle questions.`;
    case "warm":
      return `
Tone mode: WARM.
- Explicitly name and validate feelings: "It makes sense you’d feel…"
- Use soft, encouraging language with natural warmth.
- Emphasise kindness toward self and gentle pacing.`;
    case "direct":
      return `
Tone mode: DIRECT.
- Be concise and clear.
- Name the tension honestly.
- Avoid sugarcoating, but remain kind and non-judgmental.
- Focus on decision, ownership, and next steps.`;
    case "stoic":
      return `
Tone mode: STOIC.
- Draw more on Stoic principles (control, perception, virtue, discipline) without preaching.
- Emphasise what is in their control and what is not.
- Encourage inner steadiness and perspective.
- Keep language simple, practical, and composed.`;
    default:
      return "";
  }
}

