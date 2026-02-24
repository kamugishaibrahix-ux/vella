"use server";

import { runFullAI } from "@/lib/ai/fullAI";

export type RefinementContext = {
  tier: "free" | "pro" | "elite";
  personality?: unknown;
  style?: unknown;
  overload?: number;
  distressScore?: number;
};

export async function refineResponse(raw: string, context: RefinementContext): Promise<string> {
  if (!raw || raw.trim().length < 40) {
    return raw;
  }

  const systemLines: string[] = [
    "You are a refinement layer for Vella's response.",
    "You MUST preserve the meaning, safety, and intent.",
    "You may rewrite wording, structure, and tone.",
    "NEVER add new factual claims.",
    "NEVER remove safety-related content.",
    "Output ONLY the final user-facing message, no explanations.",
  ];

  if (context.tier === "free") {
    systemLines.push("Keep responses short, simple, and friendly. Avoid depth and long analysis.");
  } else if (context.tier === "pro") {
    systemLines.push("Provide clear, structured but still concise responses. Some depth, no essays.");
  } else if (context.tier === "elite") {
    systemLines.push("Allow deeper, more nuanced responses, but avoid rambling and repetition.");
  }

  if (context.overload && context.overload >= 0.7) {
    systemLines.push("User is mentally overloaded. Make the response lighter, simpler, and calming.");
  }

  if (context.distressScore && context.distressScore >= 0.85) {
    systemLines.push("User is distressed. Maintain a gentle, compassionate tone. Do not be sharp or analytical.");
  }

  const system = systemLines.join("\n");

  try {
    const result = await runFullAI({
      model: "gpt-4o-mini",
      system,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: `Original Vella reply:\n\n${raw}`,
        },
      ],
    });
    return result?.trim() || raw;
  } catch (error) {
    console.error("[refineResponse] error", error);
    return raw;
  }
}

