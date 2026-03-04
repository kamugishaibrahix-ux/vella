/** Server-side record — metadata only, no text/title. */
export type JournalEntryRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  wordCount?: number;
  localHash?: string;
  processingMode?: string;
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

