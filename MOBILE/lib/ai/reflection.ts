'use server';

import { determineFeatureKey } from "./agents";
import { getUpgradeBlock } from "@/lib/tiers/tierCheck";
import { generateLiteResponse } from "./lite";
import { runFullAI } from "./fullAI";
import type { PlanTier } from "@/lib/tiers/planUtils";
import { getRecentMessages, getSummary } from "@/lib/memory/conversation";
import { buildMemoryContext } from "@/lib/ai/memoryContext";
import { retrieveTopK, formatMemoryContext } from "@/lib/memory/retrieve";
import { updateConnectionDepth } from "@/lib/connection/depthEngine";
import { buildPersonaInstruction } from "@/lib/realtime/personaSynth";
import {
  computeDeliveryHints,
  type MoodState,
} from "@/lib/realtime/deliveryEngine";
import { DEFAULT_VELLA_VOICE_ID, type VellaVoiceId } from "@/lib/voice/vellaVoices";
import type { TonePreference, MemoryProfile } from "@/lib/memory/types";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import type { MonitoringSnapshot } from "@/lib/monitor/types";
import type { VellaPersonaMode } from "@/lib/ai/agents";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import type { HealthState } from "@/lib/realtime/health/state";
import type { EmotionalState } from "@/lib/realtime/emotion/state";

type JournalAnalysisMode = "SUMMARY" | "MEANING" | "LESSON";

type ReflectionPersonaOverrides = {
  voiceModel?: VellaVoiceId;
  toneStyle?: TonePreference;
  relationshipMode?: MemoryProfile["relationshipMode"];
  language?: SupportedLanguage;
  behaviourVector?: BehaviourVector | null;
  monitoring?: MonitoringSnapshot | null;
  emotionalState?: EmotionalState | null;
};

export type ReflectionPayload = {
  type:
    | "checkin"
    | "journal"
    | "insight"
    | "journal_analysis"
    | "emotional_patterns"
    | "prediction"
    | "life_themes"
    | "forecast"
    | "journal_patterns"
    | "behaviour_loops"
    | "cognitive_distortions"
    | "strengths_values"
    | "growth_roadmap"
    | "stoic_coach"
    | "nudge"
    | "weekly_review";
  userId: string | null;
  planTier: PlanTier;
  mood?: number;
  note?: string;
  energy?: number;
  stress?: number;
  focus?: number;
  title?: string;
  content?: string;
  insight?: unknown;
  mode?: JournalAnalysisMode;
  emotionalPatternsSummary?: string | null;
  entries?: unknown;
  checkins?: unknown;
  patterns?: unknown;
  journalThemes?: unknown;
  data?: unknown;
  persona?: ReflectionPersonaOverrides;
  locale?: string;
};

export type ReflectionResultType = "ai_response" | "lite_mode" | "upgrade_required" | "error";

export type ReflectionResult = {
  type: ReflectionResultType;
  message: string;
};

const DEFAULT_VOICE_HUD = {
  moodChip: true,
  stability: true,
  deliveryHints: true,
  sessionTime: true,
  tokenChip: true,
  strategyChip: true,
  alertChip: true,
};

export async function callVellaReflectionAPI(payload: ReflectionPayload): Promise<ReflectionResult> {
  if (!payload.userId) {
    return {
      type: "error",
      message: "You need to be signed in for Vella to reflect on this.",
    };
  }

  const serialized = JSON.stringify(payload);
  const referenceText =
    payload.note ??
    payload.content ??
    (typeof payload.insight === "string" ? payload.insight : serialized);
  const inferredFeature = determineFeatureKey(referenceText);
  const featureKey = resolveFeatureKey(payload, inferredFeature);

  const block = getUpgradeBlock(payload.planTier, featureKey);
  if (block) {
    return {
      type: "upgrade_required",
      message: block,
    };
  }

  try {
    const tokenCost = 0;
    const [recentMessages, threadSummary, displayName] = await Promise.all([
      getRecentMessages(payload.userId, 10),
      getSummary(payload.userId),
      getUserDisplayName(payload.userId),
    ]);

    const personaContext = await resolvePersonaContext(payload);
    const locale = (payload.locale as string) ?? (personaContext.language as string) ?? "en";
    const memoryContext = buildMemoryContext({
      recentMessages,
      threadSummary,
      patternsSummary: payload.emotionalPatternsSummary ?? null,
    });

    const paid = payload.planTier === "pro" || payload.planTier === "elite";
    const queryForMemory = recentMessages.length > 0
      ? (recentMessages[recentMessages.length - 1]?.content ?? referenceText)
      : referenceText;
    const memoryBlocks = await retrieveTopK({
      userId: payload.userId,
      queryText: typeof queryForMemory === "string" ? queryForMemory : referenceText,
      k: 6,
      maxCharsTotal: 1200,
    }).catch(() => []);
    const memorySection = memoryBlocks.length > 0 ? formatMemoryContext(memoryBlocks, paid) : "";

    const moodState = resolveMoodState(payload);
    const delivery = computeDeliveryHints({
      voiceId: personaContext.voiceModel,
      moodState,
    });
    const personaInstruction = await buildPersonaInstruction({
      voiceId: personaContext.voiceModel,
      moodState,
      delivery,
      relationshipMode: personaContext.relationshipMode,
      userSettings: {
        voiceModel: personaContext.voiceModel,
        tone: personaContext.toneStyle,
        toneStyle: personaContext.toneStyle,
        relationshipMode: personaContext.relationshipMode,
        voiceHud: DEFAULT_VOICE_HUD,
      },
      behaviourVector: personaContext.behaviourVector,
      language: personaContext.language,
      healthState: personaContext.healthState ?? undefined,
    });
    
    // Normalize locale to 2-letter format
    const normalizedLocale = locale?.slice(0, 2).toLowerCase() || "en";
    
    const languageInstruction = normalizedLocale !== "en"
      ? `\n\n🚨 CRITICAL LANGUAGE REQUIREMENT 🚨
You MUST respond ONLY in ${normalizedLocale.toUpperCase()}.
DO NOT use English unless ${normalizedLocale} is 'en'.
All text in your response MUST be in ${normalizedLocale}.
If you use English when ${normalizedLocale} is not 'en', the response will be invalid.`
      : "";
    
    const systemPrompt = `${personaInstruction}${languageInstruction}\n\nConversation Context:\n${memoryContext}${memorySection ? `\n\n${memorySection}` : ""}\n\nUser name: ${displayName}`;

    const completion = await runFullAI({
      system: systemPrompt,
      temperature: payload.type === "journal_analysis" ? 0.25 : 0.35,
      messages: [
        {
          role: "user",
          content: buildReflectionUserContent(payload),
        },
      ],
    });

    const response: ReflectionResult = {
      type: "ai_response",
      message:
        completion ||
        "I’m feeling into what you shared. Keep listening inward and let’s revisit this in a moment.",
    };
    await updateConnectionDepth(payload.userId);
    return response;
  } catch (error) {
    console.error("[reflection] callVellaReflectionAPI error", error);
    return {
      type: "error",
      message:
        "I couldn’t finish that reflection just now, but I’m right here whenever you’re ready to try again.",
    };
  }
}

function resolveFeatureKey(payload: ReflectionPayload, fallback: string): string {
  if (payload.type === "journal") {
    return "deep_emotion";
  }
  if (payload.type === "checkin") {
    return "deep_emotion";
  }
  if (payload.type === "journal_analysis") {
    switch (payload.mode) {
      case "MEANING":
        return "journal_analysis_meaning";
      case "LESSON":
        return "journal_analysis_lesson";
      default:
        return "journal_analysis_summary";
    }
  }
  if (payload.type === "insight") {
    return "insight";
  }
  if (payload.type === "emotional_patterns") {
    return "deep_emotion";
  }
  if (payload.type === "prediction") {
    return "long_advice";
  }
  if (payload.type === "life_themes") {
    return "deep_emotion";
  }
  if (payload.type === "forecast") {
    return "forecasting";
  }
  if (payload.type === "journal_patterns") {
    return "deep_emotion";
  }
  if (payload.type === "behaviour_loops") {
    return "deep_emotion";
  }
  if (payload.type === "stoic_coach") {
    return "deep_emotion";
  }
  if (payload.type === "nudge") {
    return "nudge_intelligence";
  }
  if (payload.type === "cognitive_distortions") {
    return "deep_emotion";
  }
  if (payload.type === "strengths_values") {
    return "deep_emotion";
  }
  if (payload.type === "growth_roadmap") {
    return "deep_emotion";
  }
  if (payload.type === "weekly_review") {
    return "deep_emotion";
  }
  return fallback || "text_short";
}

async function resolvePersonaContext(payload: ReflectionPayload) {
  const serverSettings = await loadServerPersonaSettings(payload.userId ?? null);
  const voiceModel =
    (payload.persona?.voiceModel as VellaVoiceId | undefined) ??
    serverSettings?.voiceModel ??
    DEFAULT_VELLA_VOICE_ID;
  const toneStyle =
    (payload.persona?.toneStyle as TonePreference | undefined) ??
    serverSettings?.toneStyle ??
    serverSettings?.tone ??
    "soft";
  const relationshipMode =
    (payload.persona?.relationshipMode as MemoryProfile["relationshipMode"] | undefined) ??
    serverSettings?.relationshipMode ??
    "best_friend";
  const language = resolveLanguage(payload.persona?.language ?? serverSettings?.language);
  return {
    voiceModel,
    toneStyle,
    relationshipMode,
    language,
    behaviourVector: (payload.persona?.behaviourVector as BehaviourVector | null) ?? null,
    healthState: monitoringToHealthState(payload.persona?.monitoring ?? null),
  };
}

function resolveLanguage(value?: string | null): SupportedLanguage {
  if (!value) return "en";
  return value as SupportedLanguage;
}

function monitoringToHealthState(snapshot?: MonitoringSnapshot | null): HealthState | null {
  if (!snapshot) return null;
  return {
    driftScore: snapshot.driftScore ?? 0,
    tensionLoad: snapshot.tensionLoad ?? 0,
    fatigue: snapshot.fatigueLevel ?? 0,
    clarity: snapshot.clarity ?? 1,
    lastUpdate: snapshot.timestamp ?? Date.now(),
  };
}

function resolveMoodState(payload: ReflectionPayload): MoodState {
  if ((payload.stress ?? 0) >= 7) return "grounding";
  if ((payload.mood ?? 0) >= 7) return "uplifting";
  if ((payload.mood ?? 0) <= 3) return "soothing";
  return "neutral";
}

function resolveLitePersonaMode(payload: ReflectionPayload): VellaPersonaMode {
  if ((payload.stress ?? 0) >= 7) return "stoic_coach";
  if ((payload.mood ?? 0) >= 7) return "warm_playful";
  return "soft_calm";
}

function buildReflectionUserContent(payload: ReflectionPayload): string {
  if (payload.type === "journal") {
    return [
      `Journal title: ${payload.title ?? "Untitled entry"}`,
      `Journal content:\n${payload.content ?? payload.note ?? "No content provided."}`,
      payload.note ? `Additional note: ${payload.note}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (payload.type === "checkin") {
    return [
      `Check-in mood: ${payload.mood ?? "unknown"}`,
      `Energy: ${payload.energy ?? "unknown"} / Stress: ${payload.stress ?? "unknown"} / Focus: ${
        payload.focus ?? "unknown"
      }`,
      `Note: ${payload.note ?? "No additional note."}`,
    ].join("\n");
  }

  if (payload.type === "journal_analysis") {
    const modeLabel =
      payload.mode === "MEANING"
        ? "Extract the emotional meaning and hidden needs in this entry."
        : payload.mode === "LESSON"
          ? "Turn this entry into a grounded lesson or growth takeaway."
          : "Summarize this entry in 3-4 concise sentences.";
    return [
      modeLabel,
      `Journal title: ${payload.title ?? "Untitled entry"}`,
      `Journal content:\n${payload.content ?? "No content."}`,
    ].join("\n\n");
  }

  if (payload.type === "emotional_patterns") {
    return [
      "Analyze these logs and describe up to five emotional patterns in bullet points. Focus on mood swings, triggers, and energy rhythms. Keep each pattern concise.",
      payload.content ?? "",
    ].join("\n\n");
  }

  if (payload.type === "prediction") {
    return [
      "From these recent check-ins and pattern summaries, predict near-future emotional risks for the user.",
      "Respond strictly in this format:",
      "RISK: low|medium|high",
      "TYPE: anxiety|stress|energy|mood",
      "MESSAGE: two short supportive sentences anticipating their need",
      "",
      payload.content ?? "",
      payload.emotionalPatternsSummary ? `Known patterns: ${payload.emotionalPatternsSummary}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (payload.type === "journal_patterns") {
    return [
      "From these journal entries, extract 3-5 recurring emotional themes. For each theme respond as:",
      "- Theme: <short title>",
      "  Summary: <one sentence>",
      "  Frequency: <number of entries mentioning it>",
      "Use clear bullet formatting, one theme per bullet.",
      "",
      JSON.stringify(payload.entries ?? [], null, 2),
    ].join("\n");
  }

  if (payload.type === "life_themes") {
    return [
      "You are Vella's life-themes engine. Given check-ins, journals, emotional patterns, journal themes, and a conversation summary, identify 3-5 deep long-term emotional themes for the user.",
      "Respond with bullet points in this format:",
      "- Theme: <title>",
      "  Description: <one or two short sentences describing the long-term pattern>",
      "",
      JSON.stringify(payload.data ?? {}, null, 2),
    ].join("\n");
  }

  if (payload.type === "forecast") {
    return [
      "You are Vella's forecast engine. Given recent check-ins, emotional patterns, and journal themes, produce a 24h + 7-day outlook.",
      "Respond strictly with JSON:",
      `{
  "shortTerm": { "mood": number 0-10, "energy": number 0-10, "stress": number 0-10, "confidence": number 0-1 },
  "weekTrend": "rising" | "stable" | "dipping"
}`,
      "",
      JSON.stringify(payload, null, 2),
    ].join("\n");
  }

  if (payload.type === "behaviour_loops") {
    return [
      "You are Vella's behaviour-loop detector. Given check-ins, journals, emotional patterns, and journal themes, surface up to five recurring behaviour loops.",
      "Respond with bullet points in this format:",
      "- Loop: <name>",
      "  Description: <short explanation>",
      "  Frequency: <1-10>",
      "",
      JSON.stringify(payload.data ?? {}, null, 2),
    ].join("\n");
  }

  if (payload.type === "cognitive_distortions") {
    return [
      "You are Vella's cognitive distortion detector. Analyze the provided journals, conversation snippets, and patterns to surface up to five thinking errors.",
      "Respond with bullet points in this format:",
      "- Type: <name>",
      "  Explanation: <one sentence>",
      "  Examples: example 1; example 2",
      "",
      JSON.stringify(payload.data ?? {}, null, 2),
    ].join("\n");
  }

  if (payload.type === "stoic_coach") {
    return [
      "You are Vella's Stoic reasoning engine. Provide structured guidance with a Stoic principle.",
      "Respond strictly with JSON:",
      `{
  "principle": "dichotomy_of_control" | "amor_fati" | "memento_mori" | "virtue_first" | "present_focus" | "acceptance" | "discipline_over_feelings",
  "principleLabel": "Readable label",
  "summary": "1-2 sentence summary",
  "reframe": "Stoic reinterpretation",
  "suggestedPractices": ["practice 1", "practice 2"]
}`,
      "",
      JSON.stringify(payload, null, 2),
    ].join("\n");
  }

  if (payload.type === "nudge") {
    return [
      "You are Vella's behavioural nudge engine. Craft one concise, encouraging nudge aligned with the provided type and signals. Keep it under 70 words.",
      `Nudge type: ${(payload.data as { nudgeType?: string } | undefined)?.nudgeType ?? "focus"}`,
      "Signals snapshot:",
      JSON.stringify(payload.data ?? {}, null, 2),
    ].join("\n");
  }

  if (payload.type === "weekly_review") {
    return [
      "You are Vella's weekly review analyst. Produce a JSON object matching this shape:",
      `{
  "periodStart": "ISO string",
  "periodEnd": "ISO string",
  "highlights": ["..."],
  "challenges": ["..."],
  "traitChanges": [
    { "label": "resilience", "from": 50, "to": 55, "direction": "up" }
  ],
  "emotionalSummary": "2-4 sentences",
  "behaviourPatterns": ["..."],
  "goalProgress": ["..."],
  "focusForNextWeek": ["..."]
}`,
      "Use the supplied data below as factual context. Keep the tone encouraging, grounded, and precise.",
      JSON.stringify(payload.data ?? {}, null, 2),
    ].join("\n\n");
  }

  if (payload.type === "strengths_values") {
    return [
      "You are Vella's identity engine. Analyze the provided data to surface key strengths and core values.",
      "Respond strictly with JSON:",
      `{
  "strengths": [{ "name": string, "description": string }],
  "values": [{ "name": string, "description": string }]
}`,
      "",
      JSON.stringify(payload.data ?? payload, null, 2),
    ].join("\n");
  }

  if (payload.type === "growth_roadmap") {
    return [
      "You are Vella's growth roadmap planner. Using the provided context, craft a supportive roadmap with actionable suggestions.",
      "Respond strictly with JSON:",
      `{
  "shortTerm": ["action 1", "action 2"],
  "midTerm": ["action 1", "action 2"],
  "longTerm": ["action 1", "action 2"]
}`,
      "",
      JSON.stringify(payload.data ?? payload, null, 2),
    ].join("\n");
  }

  return typeof payload.insight === "string"
    ? payload.insight
    : JSON.stringify(payload.insight ?? {}, null, 2);
}

async function getUserDisplayName(userId: string): Promise<string | null> {
  if (process.env.NODE_ENV === "development") {
    console.warn("[reflection] getUserDisplayName disabled for userId:", userId);
  }
  return null;
}
