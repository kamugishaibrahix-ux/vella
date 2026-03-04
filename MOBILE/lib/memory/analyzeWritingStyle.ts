"use server";

import { runFullAI, resolveModelForTier } from "@/lib/ai/fullAI";
import type { LocalJournalEntry } from "@/lib/local/journalLocal";

export type WritingStyleProfile = {
  tone?: string;
  pacing?: string;
  emotionalLanguage?: string;
  structure?: string;
  formality?: string;
  signaturePhrases?: string[];
  variability?: string;
  summary?: string;
};

const STYLE_SYSTEM_PROMPT = `
Extract the user's writing style attributes from their journal entries.
Return JSON ONLY in this shape:
{
  "tone": "...",
  "pacing": "...",
  "emotionalLanguage": "...",
  "structure": "...",
  "formality": "...",
  "signaturePhrases": ["...", "..."],
  "variability": "...",
  "summary": "One sentence overview"
}
Keep descriptions concise (<= 20 words).
`.trim();

export async function analyzeWritingStyle(
  entries: LocalJournalEntry[],
): Promise<WritingStyleProfile | null> {
  if (!entries || entries.length === 0) return null;

  const combined = entries
    .map((entry) => {
      const title = entry.title ? `Title: ${entry.title}` : "";
      const content = entry.content ?? "";  // content lives locally
      return [title, content].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n---\n\n")
    .slice(0, 8000); // keep prompt manageable

  if (!combined.trim()) return null;

  try {
    const result = await runFullAI({
      model: await resolveModelForTier("elite"),
      system: STYLE_SYSTEM_PROMPT,
      temperature: 0.1,
      messages: [{ role: "user", content: combined }],
    });
    if (!result) return null;
    return JSON.parse(result) as WritingStyleProfile;
  } catch (error) {
    // silent fallback
    return null;
  }
}

