"use server";

export async function generateMicroInsights(text: string | null | undefined): Promise<string[]> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return ["Add a few lines so we can spot more patterns."];
  }
  const insights: string[] = [];
  if (/(grateful|thank)/i.test(trimmed)) {
    insights.push("Gratitude surfaced—note what made that moment feel safe.");
  }
  if (/(tired|exhausted|burnout)/i.test(trimmed)) {
    insights.push("Energy felt low—plan a micro-reset before the next heavy block.");
  }
  if (/(achieve|progress|goal)/i.test(trimmed)) {
    insights.push("You’re connecting effort with goals—log one small win today.");
  }
  return insights.length > 0 ? insights : ["Keep writing; I’ll surface more insights soon."];
}

