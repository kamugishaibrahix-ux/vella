"use server";

export async function summarizeJournal(text: string | null | undefined): Promise<string> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "No content yet.";
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 160)}…`;
}

