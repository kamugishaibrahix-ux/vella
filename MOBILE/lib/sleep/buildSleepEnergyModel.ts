"use server";

import { runFullAI, resolveModelForTier } from "@/lib/ai/fullAI";
import { getAllCheckIns } from "@/lib/checkins/getAllCheckIns";
import { listJournalEntries } from "@/lib/journal/server";

export async function buildSleepEnergyModel(userId: string) {
  if (!userId) return {};

  const [checkins, journals] = await Promise.all([
    getAllCheckIns(userId),
    listJournalEntries(userId),
  ]);

  const combined = { checkins, journals };

  try {
    const result = await runFullAI({
      model: await resolveModelForTier("elite"),
      system: `
Analyse user entries for:
- sleep patterns (inferred, not literal hours)
- fatigue cycles
- burnout risk
- morning vs evening energy differences
- recovery needs
- overstimulation signs
- emotional flatness vs emotional variability
- cognitive fatigue markers
Output JSON only.
`.trim(),
      messages: [{ role: "user", content: JSON.stringify(combined) }],
      temperature: 0.2,
    });
    return result ? JSON.parse(result) : {};
  } catch (error) {
    console.error("[buildSleepEnergyModel] error", error);
    return {};
  }
}

