/**
 * Emotional Tone — deterministic template map.
 * Maps tone band (derived server-side from governance risk score) to a single line.
 * No AI. No server fetch. No free text.
 */

export type ToneBand = "steady" | "supportive" | "grounding";

const TONE_LINES: Record<ToneBand, string> = {
  steady: "You\u2019ve been steady lately.",
  supportive: "It\u2019s been uneven, but you\u2019re still here.",
  grounding: "Let\u2019s slow this down and focus on one thing.",
};

export function deriveEmotionalTone(toneBand: ToneBand): string {
  return TONE_LINES[toneBand] ?? TONE_LINES.steady;
}
