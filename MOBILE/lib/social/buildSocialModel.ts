"use server";

import { runFullAI, resolveModelForTier } from "@/lib/ai/fullAI";
import { listJournalEntries } from "@/lib/journal/server";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";

export async function buildSocialModel(userId: string) {
  if (!userId) return {};

  const [journals, checkins] = await Promise.all([
    listJournalEntries(userId),
    getAllCheckIns(userId),
  ]);

  const combined = {
    journals,
    checkins,
  };

  try {
    const result = await runFullAI({
      model: await resolveModelForTier("elite"),
      system: `
Analyse interpersonal behaviour and communication patterns.
Identify:
- communication style (direct/indirect)
- emotional expressiveness
- conflict tendencies
- attachment signals
- empathy balance
- assertiveness vs avoidance
- trust patterns
- social anxiety markers
- people-pleasing patterns
- boundaries
Output JSON only.
`.trim(),
      messages: [{ role: "user", content: JSON.stringify(combined) }],
      temperature: 0.25,
      tier: "elite",
    });
    return result ? JSON.parse(result) : {};
  } catch (error) {
    console.error("[buildSocialModel] error", error);
    return {};
  }
}

