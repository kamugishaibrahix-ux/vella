import type { LocalJournalEntry } from "@/lib/local/journalLocal";

export type JournalEntryRecord = LocalJournalEntry & {
  summary?: string | null;
  emotion_tags?: string[] | null;
  themes?: string[] | null;
  loops?: string[] | null;
  distortions?: string[] | null;
  traits?: string[] | null;
  follow_up_questions?: string[] | null;
  micro_insights?: string[] | null;
  enrichment_status?: "pending" | "failed" | "completed";
};

export type EnrichedJournalEntry = JournalEntryRecord & {
  tags: string[];
  themes: string[];
  loops: string[];
  distortions: string[];
  traits: string[];
  questions: string[];
  microInsights: string[];
  enrichment_status: "pending" | "failed" | "completed";
};

export function deriveJournalTitle(content?: string | null): string | null {
  const trimmed = content?.trim();
  if (!trimmed) return null;
  const sentence =
    trimmed
      .split(/[\n\.!?]/)
      .map((segment) => segment.trim())
      .find((segment) => segment.length > 0) ?? trimmed;
  const title = sentence.trim();
  return title.length > 80 ? `${title.slice(0, 80)}…` : title;
}

