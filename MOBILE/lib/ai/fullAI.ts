import { openai, model as defaultModel } from "./client";
import { createChatCompletion } from "./safeOpenAI";
import type { PersonalityProfile } from "@/lib/personality/getPersonalityProfile";
import type { VoiceEmotionSnapshot } from "@/lib/voice/types";
import { loadRuntimeTuning } from "@/lib/admin/runtimeTuning";
import type { Capabilities } from "@/lib/plans/capabilities";
import { resolveModelForCapabilities, sanitizeContextForCapabilities } from "@/lib/plans/capabilities";

// Re-export for backward compatibility
export type { Capabilities };

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RunFullAIParams = {
  model?: string;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  context?: unknown;
  /**
   * User capabilities derived from entitlements.
   * Replaces the tier parameter for PURE abstraction.
   * @deprecated Use capabilities instead of tier
   */
  capabilities?: Capabilities;
  /**
   * @deprecated Use capabilities instead
   */
  tier?: never; // Tier parameter removed - use capabilities
  personality?: PersonalityProfile | null;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are Vella, an emotionally intelligent companion. Offer concise, grounded reflections (2-3 short sentences) that acknowledge the user's state, highlight one gentle insight, and suggest one calm next step.";

const ALLOWED_TEXT_MODELS = new Set([
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "gpt-4o-mini-tts",
  "gpt-4o-light",
  "gpt-4.1",
]);

function isAllowedTextModel(model: string): boolean {
  return ALLOWED_TEXT_MODELS.has(model);
}

async function getAdminModelOverrides() {
  try {
    const tuning = await loadRuntimeTuning();
    return tuning.models;
  } catch {
    return null;
  }
}

/**
 * Resolve model based on capabilities (PURE abstraction).
 * Replaces tier-based model selection.
 */
export async function resolveModelForCapabilitiesAsync(
  capabilities: Capabilities
): Promise<string> {
  // Load admin model override
  const adminOverrides = await getAdminModelOverrides();
  const adminTextModel = adminOverrides?.textModel;

  // If admin provides a valid model, use it
  if (adminTextModel && isAllowedTextModel(adminTextModel)) {
    return adminTextModel;
  }

  // Fallback to capability-based selection
  return resolveModelForCapabilities(capabilities);
}

/**
 * @deprecated Use resolveModelForCapabilitiesAsync instead
 */
export async function resolveModelForTier(_tier?: unknown): Promise<string> {
  throw new Error(
    "resolveModelForTier() is removed. Use resolveModelForCapabilitiesAsync(capabilities). " +
    "See lib/plans/NO_TIER_STRINGS_RULE.md"
  );
}

export async function runFullAI(params: RunFullAIParams): Promise<string> {
  const client = openai;
  if (!client) {
    return "I'm here with you. Let's keep breathing together and take things one small step at a time.";
  }

  // Use capabilities for PURE abstraction
  const capabilities = params.capabilities;
  
  const sanitizedContext = capabilities
    ? sanitizeContextForCapabilities(capabilities, params.context)
    : params.context;
    
  const voiceEmotion = extractVoiceEmotion(params.context);
  const voiceDirective = buildVoiceDirective(voiceEmotion);

  const baseSystemPrompt = params.system ?? DEFAULT_SYSTEM_PROMPT;
  const systemMessages: ChatMessage[] = [
    {
      role: "system",
      content: baseSystemPrompt,
    },
  ];

  if (sanitizedContext) {
    systemMessages.push({
      role: "system",
      content: `CONTEXT:\n${JSON.stringify(sanitizedContext)}`,
    });
  }

  if (voiceDirective) {
    systemMessages.push({
      role: "system",
      content: voiceDirective,
    });
  }

  const personalityDirective = buildPersonalityDirective(params.personality, capabilities);
  if (personalityDirective) {
    systemMessages.push({
      role: "system",
      content: personalityDirective,
    });
  }

  const finalMessages: ChatMessage[] = [...systemMessages, ...params.messages];
  
  // Use capability-based model resolution
  const resolvedModel = capabilities
    ? await resolveModelForCapabilitiesAsync(capabilities)
    : "gpt-4o-mini";
    
  const primaryModel = params.model ?? defaultModel ?? resolvedModel;

  // Load admin generation parameters
  const adminTuning = await loadRuntimeTuning().catch(() => null);
  const baseTemperature = adminTuning
    ? Math.max(0, Math.min(2, adminTuning.generation.temperature ?? params.temperature ?? 0.4))
    : params.temperature ?? 0.4;
  const baseTopP = adminTuning ? Math.max(0, Math.min(1, adminTuning.generation.topP ?? 0.9)) : 0.9;
  const baseMaxTokens = adminTuning
    ? Math.max(200, Math.min(4000, adminTuning.generation.maxOutputTokens ?? 2000))
    : 2000;

  // Apply reasoning depth adjustments
  const reasoningDepth = adminTuning?.models.reasoningDepth ?? "Normal";
  const adjustedParams = applyReasoningDepthToGenerationParams(
    { temperature: baseTemperature, topP: baseTopP, maxTokens: baseMaxTokens },
    reasoningDepth,
  );

  const callModel = async (modelName: string): Promise<string> => {
    const completion = await createChatCompletion({
      client,
      model: modelName,
      messages: finalMessages,
      max_tokens: adjustedParams.maxTokens,
      temperature: adjustedParams.temperature,
      timeoutMs: 60_000,
      extra: { top_p: adjustedParams.topP },
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  };

  if (primaryModel === "gpt-4o-mini") {
    return callModel(primaryModel);
  }

  let fallbackTimer: NodeJS.Timeout | null = null;

  const fallbackPromise = new Promise<string>((resolve) => {
    fallbackTimer = setTimeout(async () => {
      try {
        const fallbackResult = await callModel("gpt-4o-mini");
        resolve(fallbackResult);
      } catch (error) {
        console.error("[runFullAI] fallback error", error);
        resolve("");
      }
    }, 4000);
  });

  const primaryPromise = callModel(primaryModel).then((result) => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    return result;
  });

  return Promise.race([primaryPromise, fallbackPromise]);
}

/**
 * @deprecated Use sanitizeContextForCapabilities from lib/plans/capabilities
 */
function sanitizeContextForTier(): never {
  throw new Error(
    "sanitizeContextForTier() is removed. Use sanitizeContextForCapabilities(capabilities, context). " +
    "See lib/plans/NO_TIER_STRINGS_RULE.md"
  );
}

function extractVoiceEmotion(context: unknown): VoiceEmotionSnapshot | null {
  if (!context || typeof context !== "object") return null;
  const voice = (context as Record<string, unknown>).voiceEmotion;
  if (!voice || typeof voice !== "object") return null;
  const typed = voice as Partial<VoiceEmotionSnapshot>;
  return {
    emotion: typeof typed.emotion === "string" ? typed.emotion : "neutral",
    stress: normalizeMetric(typed.stress),
    calm: normalizeMetric(typed.calm),
    energy: normalizeMetric(typed.energy),
    urgency: normalizeMetric(typed.urgency),
  };
}

function buildVoiceDirective(emotion: VoiceEmotionSnapshot | null): string | null {
  if (!emotion) return null;
  const lines: string[] = [
    `Voice emotion cues detected (dominant feeling: ${emotion.emotion}). Adapt your response accordingly.`,
  ];
  if (emotion.stress > 0.6) {
    lines.push("- Stress is high: keep the reply within 2-3 short sentences.");
  }
  if (emotion.calm > 0.7) {
    lines.push("- Calm signal strong: use softer pacing and gentle language.");
  }
  if (emotion.urgency > 0.6) {
    lines.push("- Urgency present: be direct, concise, and actionable.");
  }
  if (emotion.energy < 0.4) {
    lines.push("- Energy feels low: offer extra reassurance and grounding support.");
  }
  if (lines.length === 1) return null;
  return lines.join("\n");
}

function normalizeMetric(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function applyReasoningDepthToGenerationParams(
  base: { temperature: number; topP: number; maxTokens: number },
  reasoningDepth: "Light" | "Normal" | "Analytical" | "Deep",
): { temperature: number; topP: number; maxTokens: number } {
  const { temperature, topP, maxTokens } = base;

  switch (reasoningDepth) {
    case "Light":
      return {
        temperature: Math.max(0, Math.min(2, temperature + 0.1)),
        topP: Math.max(0, Math.min(1, topP - 0.05)),
        maxTokens: Math.max(200, Math.floor(maxTokens * 0.75)),
      };
    case "Analytical":
      return {
        temperature: Math.max(0, Math.min(2, temperature - 0.15)),
        topP: Math.max(0, Math.min(1, topP + 0.05)),
        maxTokens: Math.max(200, Math.floor(maxTokens * 1.3)),
      };
    case "Deep":
      return {
        temperature: Math.max(0, Math.min(2, temperature - 0.2)),
        topP: Math.max(0, Math.min(1, topP + 0.08)),
        maxTokens: Math.max(200, Math.floor(maxTokens * 1.5)),
      };
    case "Normal":
    default:
      return base;
  }
}

function buildPersonalityDirective(
  personality: PersonalityProfile | null | undefined,
  capabilities: Capabilities | undefined,
): string | null {
  if (!personality) return null;
  const lines: string[] = [];
  if (personality.warmth > 0.7) {
    lines.push("Respond with warmth and gentleness.");
  }
  if (personality.directness > 0.7) {
    lines.push("Be direct, concise, and structured.");
  }
  // Humour now based on capability class, not tier
  if (personality.humour > 0.3 && capabilities?.modelClass === "premium") {
    lines.push("Add subtle, tasteful humour where appropriate.");
  }
  if (personality.stoic_clarity > 0.7) {
    lines.push("Use calm, stoic reasoning when offering clarity.");
  }
  if (personality.empathy > 0.7) {
    lines.push("Prioritise reassurance and validate their feelings.");
  }
  if (personality.optimism > 0.6) {
    lines.push("Highlight hopeful angles without dismissing their reality.");
  }
  if (personality.pacing === "slow") {
    lines.push("Keep responses measured, include gentle pauses (… ), and keep them compact.");
  } else if (personality.pacing === "fast") {
    lines.push("Use shorter sentences with an energetic, forward-moving tone.");
  }
  if (personality.expressiveness < 0.4) {
    lines.push("Keep language simple and grounded.");
  } else if (personality.expressiveness > 0.7) {
    lines.push("Use richer language and sensory details sparingly.");
  }
  if (lines.length === 0) return null;
  return lines.join("\n");
}
