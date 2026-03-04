"use server";

import { runFullAI } from "./fullAI";
import type { Capabilities } from "@/lib/plans/capabilities";
import { buildRefinementGuidance } from "@/lib/plans/capabilities";

export type RefinementContext = {
  /**
   * User capabilities derived from entitlements.
   * Replaces tier for PURE abstraction.
   */
  capabilities: Capabilities;
  /**
   * @deprecated Use capabilities instead
   */
  tier?: never;
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
    "You MUST preserve the meaning, safety, and the intent.",
    "You may rewrite wording, structure, and tone.",
    "NEVER add new factual claims.",
    "NEVER remove safety-related content.",
    "Output ONLY the final user-facing message, no explanations.",
  ];

  // PURE abstraction: Use capabilities instead of tier strings
  const refinementGuidance = buildRefinementGuidance(context.capabilities);
  if (refinementGuidance) {
    systemLines.push(refinementGuidance);
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

/**
 * @deprecated Use refineResponse with capabilities instead of tier
 */
export async function refineResponseWithTier(
  _raw: string,
  _context: { tier: string }
): Promise<never> {
  throw new Error(
    "refineResponseWithTier() is removed. Use refineResponse() with capabilities. " +
    "See lib/plans/NO_TIER_STRINGS_RULE.md"
  );
}
