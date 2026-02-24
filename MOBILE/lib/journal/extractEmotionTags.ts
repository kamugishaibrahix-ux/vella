"use server";

const TAG_MAP: Record<string, string> = {
  anxious: "anxiety",
  worried: "anxiety",
  stressed: "stress",
  calm: "calm",
  grateful: "gratitude",
  exhausted: "fatigue",
  energized: "energy",
  lonely: "connection",
  angry: "anger",
  hopeful: "hope",
};

export async function extractEmotionTags(text: string | null | undefined): Promise<string[]> {
  const lower = (text ?? "").toLowerCase();
  if (!lower) return [];
  const tags = new Set<string>();
  for (const [keyword, tag] of Object.entries(TAG_MAP)) {
    if (lower.includes(keyword)) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

