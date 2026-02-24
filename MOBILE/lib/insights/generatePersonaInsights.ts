"use server";

import { randomUUID } from "crypto";
import { openai, model } from "@/lib/ai/client";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import type { BehaviourPattern } from "@/lib/insights/types";
import type { TonePreference, MemoryProfile } from "@/lib/memory/types";
import type { SupportedLanguageCode } from "@/lib/ai/languages";
import type { EmotionalState } from "@/lib/realtime/emotion/state";
import { buildPersonaInstruction } from "@/lib/realtime/personaSynth";
import {
  computeDeliveryHints,
  type MoodState,
} from "@/lib/realtime/deliveryEngine";
import {
  DEFAULT_VELLA_VOICE_ID,
  type VellaVoiceId,
} from "@/lib/voice/vellaVoices";

export type PersonaInsightMessage = {
  role: "user" | "assistant";
  text: string;
};

export type PersonaInsightParams = {
  userId?: string | null;
  messages: PersonaInsightMessage[];
  emotionalState?: EmotionalState | null;
  emotionalHistory?: EmotionalState[];
  behaviourVector?: BehaviourVector | null;
  persona?: {
    voiceModel?: VellaVoiceId | string | null;
    toneStyle?: TonePreference | null;
    relationshipMode?: MemoryProfile["relationshipMode"] | null;
    language?: SupportedLanguageCode | string | null;
  };
};

export type PersonaInsightSnapshot = {
  items: BehaviourPattern[];
  patterns: BehaviourPattern[];
  insights: BehaviourPattern[];
  mode: "ai" | "lite";
  fallback: boolean;
  lastComputed: number;
};

export async function generatePersonaInsights(
  params: PersonaInsightParams,
): Promise<PersonaInsightSnapshot> {
  const timestamp = Date.now();
  const personaResult = await tryPersonaCompletion(params, timestamp);
  if (personaResult) {
    return personaResult;
  }

  const liteItems = buildLitePatterns(
    params.messages,
    params.emotionalHistory ?? [],
  );
  return wrapPatterns(liteItems, "lite", timestamp, true);
}

async function tryPersonaCompletion(
  params: PersonaInsightParams,
  timestamp: number,
): Promise<PersonaInsightSnapshot | null> {
  if (!openai || params.messages.length === 0) {
    return null;
  }

  const voiceModel = (params.persona?.voiceModel as VellaVoiceId | undefined) ?? DEFAULT_VELLA_VOICE_ID;
  const toneStyle = (params.persona?.toneStyle as TonePreference | undefined) ?? "soft";
  const relationshipMode =
    (params.persona?.relationshipMode as MemoryProfile["relationshipMode"] | undefined) ?? "best_friend";
  const language =
    (params.persona?.language as SupportedLanguageCode | undefined) ?? "en";
  const moodState = deriveMoodState(params.emotionalState);
  const delivery = computeDeliveryHints({
    voiceId: voiceModel,
    moodState,
    emotionalState: params.emotionalState,
  });

  const personaInstruction = await buildPersonaInstruction({
    voiceId: voiceModel,
    moodState,
    delivery,
    relationshipMode,
    userSettings: {
      voiceModel,
      tone: toneStyle,
      toneStyle,
      relationshipMode,
      voiceHud: {
        moodChip: true,
        stability: true,
        deliveryHints: true,
        sessionTime: true,
        tokenChip: true,
        strategyChip: true,
        alertChip: true,
      },
    },
    language,
    behaviourVector: params.behaviourVector ?? null,
    emotionalState: params.emotionalState ?? undefined,
  });

  const snippet = buildConversationSnippet(params.messages);
  if (!snippet) return null;

  const userPrompt = [
    "Review the recent conversation between Vella and the user.",
    "Identify up to three behavioural or emotional patterns that Vella should keep monitoring.",
    "Respond as strict JSON with the shape:",
    `{"patterns":[{"label":"","description":"","evidenceMessages":[""]}]}`,
    "Evidence messages MUST be short quotes from the provided snippet.",
    "If there is no meaningful signal yet, return {\"patterns\":[]}.",
    "",
    "Conversation snippet:",
    snippet,
  ].join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `${personaInstruction}\nYou are Vella's realtime insight engine. Extract truthful behavioural patterns only when evidence exists.`,
        },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      patterns?: Array<Partial<BehaviourPattern>>;
    };
    const rawPatterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
    const mapped = mapPatterns(rawPatterns, timestamp);
    return wrapPatterns(mapped, "ai", timestamp, false);
  } catch (error) {
    // silent fallback
    return null;
  }
}

function buildConversationSnippet(messages: PersonaInsightMessage[]) {
  const slice = messages.slice(-5);
  if (slice.length === 0) return "";
  return slice
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.text}`)
    .join("\n");
}

function mapPatterns(
  patterns: Array<Partial<BehaviourPattern>>,
  timestamp: number,
): BehaviourPattern[] {
  return patterns
    .map((pattern, index) => {
      const label = (pattern.label ?? pattern.description ?? "").toString().trim();
      const description = (pattern.description ?? label).toString().trim();
      if (!label || !description) {
        return null;
      }
      const evidence = Array.isArray(pattern.evidenceMessages)
        ? pattern.evidenceMessages.filter((msg) => typeof msg === "string" && msg.trim().length > 0).slice(0, 3)
        : [];
      return {
        id: pattern.id ?? `persona-${index}-${randomUUID()}`,
        label,
        description,
        evidenceMessages: evidence,
        lastUpdated: timestamp,
      } satisfies BehaviourPattern;
    })
    .filter((entry): entry is BehaviourPattern => Boolean(entry));
}

function buildLitePatterns(
  messages: PersonaInsightMessage[],
  emotionalHistory: EmotionalState[],
): BehaviourPattern[] {
  const now = Date.now();
  const patterns: BehaviourPattern[] = [];
  const userMessages = messages.filter((msg) => msg.role === "user");
  const negativeTriggers = /sad|tired|overwhelmed|anxious|burned\s?out|exhausted|stressed/i;
  const negativeCount = userMessages.filter((msg) => negativeTriggers.test(msg.text)).length;

  if (negativeCount >= 3) {
    patterns.push({
      id: "repeated_emotional_strain",
      label: "Recurring emotional strain (lite)",
      description:
        "Recent messages mention feeling low, drained, or overwhelmed several times in a short span.",
      evidenceMessages: userMessages
        .slice(-5)
        .map((msg) => msg.text)
        .filter(Boolean),
      lastUpdated: now,
      fallback: true,
      mode: "lite",
    });
  }

  const tensionSpike = emotionalHistory
    .slice(-5)
    .some((snapshot) => (snapshot?.tension ?? 0) >= 0.7 || (snapshot?.arousal ?? 0) >= 0.65);

  if (tensionSpike) {
    patterns.push({
      id: "tension_spikes",
      label: "Tension spikes (lite)",
      description: "Recent emotional telemetry shows elevated tension or arousal.",
      evidenceMessages: [],
      lastUpdated: now,
      fallback: true,
      mode: "lite",
    });
  }

  if (patterns.length === 0) {
    patterns.push({
      id: "signal_gathering",
      label: "Still gathering signal (lite)",
      description: "No repeating loops detected yet. Keep sharing so I can flag reliable patterns.",
      evidenceMessages: [],
      lastUpdated: now,
      fallback: true,
      mode: "lite",
    });
  }

  return patterns.slice(0, 3);
}

function wrapPatterns(
  patterns: BehaviourPattern[],
  mode: "ai" | "lite",
  timestamp: number,
  fallback: boolean,
): PersonaInsightSnapshot {
  const normalised = patterns.map((pattern) => ({
    ...pattern,
    lastUpdated: pattern.lastUpdated ?? timestamp,
    mode: pattern.mode ?? mode,
    fallback: pattern.fallback ?? fallback,
  }));

  return {
    items: normalised,
    patterns: normalised,
    insights: normalised,
    mode,
    fallback,
    lastComputed: timestamp,
  };
}

function deriveMoodState(emotionalState?: EmotionalState | null): MoodState {
  if (!emotionalState) return "neutral";
  if (emotionalState.valence <= -0.2) return "soothing";
  if (emotionalState.valence >= 0.3) return "uplifting";
  if (emotionalState.tension >= 0.6) return "grounding";
  return "neutral";
}

