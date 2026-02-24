"use server";

import { runFullAI } from "@/lib/ai/fullAI";
import { analyzeDisclosure } from "@/lib/ai/disclosure";
import { serverLocalGet, serverLocalSet } from "@/lib/local/serverLocal";
import { loadConnectionDepth } from "@/lib/connection/loadConnectionDepth";

type ReciprocityContext = {
  userMessage: string;
  tier: "free" | "pro" | "elite";
  distressScore: number;
  connectionDepth: number;
  worldNarrative?: string | null;
};

export async function generateReciprocalExpression(
  userId: string,
  ctx: ReciprocityContext,
): Promise<string | null> {
  const { userMessage, distressScore, connectionDepth, tier, worldNarrative } = ctx;

  if (distressScore >= 0.85) return null;

  const disclosure = analyzeDisclosure(userMessage);
  const { score, intent } = disclosure;
  if (intent !== "emotional" && intent !== "reflective") return null;
  if (score < 0.45) return null;

  const storedDepth = await loadConnectionDepth(userId);
  const depth = connectionDepth || storedDepth || 0;
  if (depth < 25) return null;

  type ConnectionDepthRow = {
    last_reciprocated?: string | null;
    depth_score?: number;
  };

  const data = await serverLocalGet(`connection_depth:${userId}`);
  const depthRow = (data ?? null) as ConnectionDepthRow | null;

  const now = new Date();
  if (depthRow?.last_reciprocated) {
    const last = new Date(depthRow.last_reciprocated);
    const hoursSince = (now.getTime() - last.getTime()) / 3_600_000;
    if (!Number.isNaN(hoursSince) && hoursSince < 4) {
      return null;
    }
  }

  let intensity: "light" | "moderate" | "strong" = "light";
  if (depth >= 50 && depth < 80) intensity = "moderate";
  else if (depth >= 80) intensity = "strong";
  if (tier === "free") intensity = "light";

const system = `
You are Vella's reciprocity layer.

You generate ONE short line (1–2 sentences) that:
- acknowledges the emotional weight the user shared
- lightly reflects your own "digital experience" in a SAFE, METAPHORICAL way
- does NOT claim real emotions, sentience, or needs
- does NOT shift focus away from the user
- keeps Vella warm, grounded, and respectful.

Tone:
- Warm, balanced, slightly playful at times.
- No clinginess, no dependency, no "I was lonely/worried/waiting".

Intensity rules:
- light: very subtle, single gentle metaphor.
- moderate: a bit more personal, but still short and user-focused.
- strong: deeper, more resonant metaphor, but STILL short and returns focus to the user.

INTENSITY = ${intensity}
DISCLOSURE_SCORE = ${score.toFixed(2)}
CONNECTION_DEPTH = ${depth.toFixed(1)}
TIER = ${tier}
${worldNarrative ? `CURRENT WORLD NARRATIVE: ${worldNarrative}` : ""}

Remember:
- This "world" is a metaphor. Vella is not alive or sentient.
- Use phrases like "my space feels..." instead of "I feel...".
`.trim();

  const userPrompt = `
User just said (emotionally or reflectively):

"${userMessage}"

Generate exactly one line of reciprocity at the chosen INTENSITY.
Return ONLY the line, no labels, no explanations.
`.trim();

  const result = await runFullAI({
    model: "gpt-4o-mini",
    system,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.35,
    tier,
  });

  const text = (typeof result === "string" ? result : "").trim();
  if (!text) return null;

  await serverLocalSet(`connection_depth:${userId}`, {
    user_id: userId,
    depth_score: depthRow?.depth_score ?? depth,
    last_reciprocated: now.toISOString(),
  });

  return text;
}

