import { openai, model as defaultModel } from "./client";
import type { PlanTier } from "@/lib/tiers/planUtils";
import type { PersonalityProfile } from "@/lib/personality/getPersonalityProfile";
import type { VoiceEmotionSnapshot } from "@/lib/voice/types";
import { loadRuntimeTuning } from "@/lib/admin/runtimeTuning";

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
  tier?: PlanTier;
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

export async function resolveModelForTier(tier: PlanTier = "free"): Promise<string> {
  // Load admin model override
  const adminOverrides = await getAdminModelOverrides();
  const adminTextModel = adminOverrides?.textModel;
  
  // If admin provides a valid model, use it; otherwise fall back to tier-based logic
  if (adminTextModel && isAllowedTextModel(adminTextModel)) {
    return adminTextModel;
  }
  
  // Fallback to tier-based selection
  if (tier === "elite") return "gpt-4.1";
  return "gpt-4o-mini";
}

export async function runFullAI(params: RunFullAIParams): Promise<string> {
  const client = openai;
  if (!client) {
    return "I’m here with you. Let’s keep breathing together and take things one small step at a time.";
  }

  const sanitizedContext = sanitizeContextForTier(params.tier, params.context);
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

  const personalityDirective = buildPersonalityDirective(params.personality, params.tier);
  if (personalityDirective) {
    systemMessages.push({
      role: "system",
      content: personalityDirective,
    });
  }

  const finalMessages: ChatMessage[] = [...systemMessages, ...params.messages];
  const tierModel = await resolveModelForTier(params.tier ?? "free");
  const primaryModel = params.model ?? defaultModel ?? tierModel;
  
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
    const completion = await client.chat.completions.create({
      model: modelName,
      temperature: adjustedParams.temperature,
      top_p: adjustedParams.topP,
      max_tokens: adjustedParams.maxTokens,
      messages: finalMessages,
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

function sanitizeContextForTier(tier: PlanTier | undefined, context: unknown): unknown {
  if (tier !== "free" || !context || typeof context !== "object") {
    return context;
  }
  const clone: Record<string, unknown> = { ...(context as Record<string, unknown>) };
  delete clone.patterns;
  delete clone.themes;
  delete clone.loops;
  delete clone.distortions;
  delete clone.traits;
  delete clone.goals;
  delete clone.forecast;
  delete clone.growth;
  delete clone.strategies;
  return clone;
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
      // Slightly lower maxTokens, higher temperature, slightly lower topP
      return {
        temperature: Math.max(0, Math.min(2, temperature + 0.1)),
        topP: Math.max(0, Math.min(1, topP - 0.05)),
        maxTokens: Math.max(200, Math.floor(maxTokens * 0.75)), // -25%
      };
    case "Analytical":
      // Increase maxTokens, decrease temperature, slightly higher topP
      return {
        temperature: Math.max(0, Math.min(2, temperature - 0.15)),
        topP: Math.max(0, Math.min(1, topP + 0.05)),
        maxTokens: Math.max(200, Math.floor(maxTokens * 1.3)), // +30%
      };
    case "Deep":
      // Larger increase in maxTokens, larger decrease in temperature, higher topP
      return {
        temperature: Math.max(0, Math.min(2, temperature - 0.2)),
        topP: Math.max(0, Math.min(1, topP + 0.08)),
        maxTokens: Math.max(200, Math.floor(maxTokens * 1.5)), // +50%
      };
    case "Normal":
    default:
      // No adjustment
      return base;
  }
}

function buildPersonalityDirective(
  personality: PersonalityProfile | null | undefined,
  tier: PlanTier | undefined,
): string | null {
  if (!personality) return null;
  const lines: string[] = [];
  if (personality.warmth > 0.7) {
    lines.push("Respond with warmth and gentleness.");
  }
  if (personality.directness > 0.7) {
    lines.push("Be direct, concise, and structured.");
  }
  if (personality.humour > 0.3 && tier === "elite") {
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

