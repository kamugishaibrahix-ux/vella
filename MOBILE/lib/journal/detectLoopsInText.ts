"use server";

export async function detectLoopsInText(text: string | null | undefined): Promise<string[]> {
  const lower = (text ?? "").toLowerCase();
  if (!lower) return [];
  const loops: string[] = [];
  if (/(late night|can't sleep|scroll)/.test(lower)) {
    loops.push("Late-night anxiety loop");
  }
  if (/(avoid|delay|procrastinat)/.test(lower)) {
    loops.push("Avoidance loop");
  }
  if (/(burnout|exhausted|drained)/.test(lower)) {
    loops.push("Burnout cycle");
  }
  if (/(overthink|ruminate|spiral)/.test(lower)) {
    loops.push("Overthinking spiral");
  }
  return loops.slice(0, 3);
}

