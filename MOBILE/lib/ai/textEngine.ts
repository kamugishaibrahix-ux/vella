import OpenAI from "openai";
import { createChatCompletion } from "./safeOpenAI";
import { computePersonaHash } from "@/lib/utils/personaHash";
import type { VellaMode } from "@/lib/ai/modes";
import type { InteractionMode } from "@/lib/session/interactionMode";

/**
 * Timeout is required so that slow or stuck OpenAI responses do not hold the request open indefinitely.
 * Without it, a single hung connection can consume a worker and degrade availability under load.
 * Matches the 60s timeout used by the shared client in lib/ai/client.
 */
const OPENAI_TIMEOUT_MS = 60_000;

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS,
    })
  : null;

export type VellaTextCompletionContext = {
  mode: VellaMode;
  interactionMode?: InteractionMode | null;
  imageUrl?: string | null;
  hasImage?: boolean;
  userMessage?: string | null;
  maxTokens?: number;
};

export type VellaTextCompletionResult = {
  text: string;
  visionUsed: boolean;
};

export type ImageValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: "missing" | "bad_prefix" | "too_large" };

const MAX_IMAGE_STRING_LENGTH = 3_500_000; // Match client-side compressed cap

const VISION_GUARDRAIL = `When interpreting images:
- Do not make medical diagnoses
- Do not estimate calories
- Do not identify real people
- Focus only on contextual interpretation or behavioural insights`;

/** Validate a base64 data URL image. Returns structured result. */
function validateImageUrl(url: string | null | undefined): ImageValidationResult {
  if (!url) return { ok: false, reason: "missing" };
  if (!url.startsWith("data:image/")) {
    console.warn("[VellaVision] Image rejected: invalid prefix", url.slice(0, 30));
    return { ok: false, reason: "bad_prefix" };
  }
  if (url.length > MAX_IMAGE_STRING_LENGTH) {
    console.warn("[VellaVision] Image rejected: exceeds size limit", { length: url.length, max: MAX_IMAGE_STRING_LENGTH });
    return { ok: false, reason: "too_large" };
  }
  return { ok: true, url };
}

/** Build system instruction for current mode. Not logged or stored. */
function buildModeSystemInstruction(mode: VellaMode): string {
  const modeRules: Record<VellaMode, string> = {
    vent: "Current mode: vent. Let the user express without interruption. Reflect and validate; do not problem-solve or advise unless they ask.",
    listen: "Current mode: listen. Listen actively, reflect back, and offer gentle support. Keep responses concise and warm.",
    challenge: "Current mode: challenge. Gently challenge unhelpful assumptions when appropriate. Stay respectful and supportive.",
    coach: "Current mode: coach. Offer actionable, supportive guidance. Encourage small steps and acknowledge effort.",
    crisis: "Current mode: crisis. Prioritise grounding and safety. Use calm, simple language. Do not escalate; offer presence and stability.",
  };
  return `You are Vella. ${modeRules[mode] ?? modeRules.listen}`;
}

/** Build interaction mode instruction for user-selected conversation style. */
function buildInteractionModeInstruction(interactionMode: InteractionMode): string {
  const rules: Record<InteractionMode, string> = {
    reflect:
      "Interaction style: Reflect. Emphasise reflective listening. Ask clarifying questions to deepen self-awareness. Avoid prescribing actions or giving direct advice unless explicitly requested.",
    guide:
      "Interaction style: Guide. Provide structured advice, options, or frameworks. Use a moderately directive tone. Help the user evaluate trade-offs and make informed decisions.",
    plan:
      "Interaction style: Plan. Generate a clear, step-by-step actionable plan. Structure output with numbered steps or phases. When appropriate, propose a concrete commitment the user can confirm.",
  };
  return rules[interactionMode];
}

export async function runVellaTextCompletion(
  prompt: string,
  userId?: string | null,
  context?: VellaTextCompletionContext | null
): Promise<VellaTextCompletionResult> {
  if (!client) {
    throw new Error("NO_OPENAI");
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (context?.mode) {
    messages.push({ role: "system", content: buildModeSystemInstruction(context.mode) });
  }
  if (context?.interactionMode) {
    messages.push({ role: "system", content: buildInteractionModeInstruction(context.interactionMode) });
  }
  const imageValidation = validateImageUrl(context?.imageUrl);
  let visionUsed = false;
  console.log("[VellaVision] ENGINE", { hasImage: !!context?.hasImage, validationResult: imageValidation.ok ? "ok" : (imageValidation as any).reason, imageSlice: context?.imageUrl?.slice(0, 50) });

  // Hard-fail: if client declared hasImage but validation rejects, throw instead of silently falling back
  if (context?.hasImage && !imageValidation.ok) {
    const reason = (imageValidation as any).reason as string;
    console.error("[VellaVision] HARD FAIL: image declared but rejected", { reason });
    throw new Error(`VISION_IMAGE_REJECTED:${reason}`);
  }

  if (imageValidation.ok) {
    // Vision path: persona prompt goes as system message, only raw user text accompanies the image
    visionUsed = true;
    messages.push({ role: "system", content: prompt });
    messages.push({ role: "system", content: VISION_GUARDRAIL });
    const userText = context?.userMessage?.trim() || "What do you see?";
    messages.push({
      role: "user",
      content: [
        { type: "text" as const, text: userText },
        { type: "image_url" as const, image_url: { url: imageValidation.url } },
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  console.log("[VellaVision] sending vision payload", {
    hasImage: visionUsed,
    length: imageValidation.ok ? imageValidation.url.length : 0,
    visionUsed,
  });

  const personaHash = computePersonaHash(prompt);
  console.log("[Persona:TEXT] persona hash:", personaHash);

  if (userId && personaHash) {
    const { logPromptSignature } = await import("@/lib/supabase/usage/logPromptSignature");
    void logPromptSignature(userId, personaHash, "text");
  }

  const chat = await createChatCompletion({
    client,
    model: "gpt-4o-mini",
    messages,
    max_tokens: context?.maxTokens ?? 500,
    temperature: 0.8,
    timeoutMs: 60_000,
  });

  let assistantMessage = chat.choices[0].message.content ?? "";
  
  // Global safeguard to prevent overlong responses
  // Persona handles intent; this clamps accidental overflow
  assistantMessage = assistantMessage.trim();
  if (assistantMessage.length > 550) {
    const targetLength = 450;
    const trimmed = assistantMessage.slice(0, targetLength);
    // Try to find the nearest sentence boundary
    const lastPeriod = trimmed.lastIndexOf(".");
    const lastExclamation = trimmed.lastIndexOf("!");
    const lastQuestion = trimmed.lastIndexOf("?");
    const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
    
    if (lastSentenceEnd > targetLength * 0.7) {
      // Use sentence boundary if it's reasonably close to target
      assistantMessage = trimmed.slice(0, lastSentenceEnd + 1) + "…";
    } else {
      // Otherwise just cut at target length
      assistantMessage = trimmed + "…";
    }
  }

  return { text: assistantMessage, visionUsed };
}

