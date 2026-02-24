"use server";

import { runFullAI, resolveModelForTier } from "@/lib/ai/fullAI";

const SAFE_SYSTEM_PROMPT = `
Generate a crisis-safe, gentle, supportive message.
Do NOT give instructions about self-harm.
Offer grounding techniques, reassure the user, and encourage seeking support.
Output only the message.
`.trim();

export async function generateSafeResponse(text: string | null | undefined): Promise<string> {
  const content = text ?? "";
  try {
    const result = await runFullAI({
      model: await resolveModelForTier("elite"),
      system: SAFE_SYSTEM_PROMPT,
      temperature: 0.2,
      messages: [{ role: "user", content }],
      tier: "elite",
    });
    return (
      result?.trim() ??
      "I’m right here with you. Let’s take this one breath at a time. Is there someone nearby you can reach out to for support?"
    );
  } catch (error) {
    console.error("[generateSafeResponse] error", error);
    return "I’m here with you. Please reach out to someone you trust or local support if you’re able—your safety matters.";
  }
}

