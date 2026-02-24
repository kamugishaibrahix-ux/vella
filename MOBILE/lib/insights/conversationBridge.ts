import type { MemoryProfile } from "@/lib/memory/types";
import type { IntentType } from "@/lib/ai/intent/router";
import { buildPersonaInstruction } from "@/lib/realtime/personaSynth";
import {
  computeDeliveryHints,
  type MoodState,
} from "@/lib/realtime/deliveryEngine";
import { DEFAULT_VELLA_VOICE_ID, normalizeVellaVoiceId } from "@/lib/voice/vellaVoices";
import type { TonePreference } from "@/lib/memory/types";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import type { RealtimeDeliveryMeta } from "@/lib/realtime/useRealtimeVella";
import type { VellaSettings } from "@/lib/settings/vellaSettings";
import type { PatternClientResult } from "@/lib/insights/requestPatternsClient";

type PersonaSnapshot = {
  voiceModel?: string | null;
  toneStyle?: TonePreference | null;
  relationshipMode?: MemoryProfile["relationshipMode"] | null;
  language?: SupportedLanguage | null;
};

type BridgeParams = {
  memory: MemoryProfile | null;
  intent: IntentType;
  realtime?: RealtimeDeliveryMeta | null;
  persona?: PersonaSnapshot | null;
  patternSnapshot?: PatternClientResult | null;
};

export async function buildInsightContextForPrompt({
  memory,
  intent,
  realtime,
  persona,
  patternSnapshot,
}: BridgeParams): Promise<string> {
  const lines: string[] = [];
  if (intent === "EMOTIONAL_SUPPORT") {
    const personaInstruction = await buildBridgePersonaInstruction(realtime, persona);
    if (personaInstruction) {
      lines.push("Persona focus:", personaInstruction);
    }
    const realtimeInsights = realtime?.insights ?? [];
    if (realtimeInsights.length > 0) {
      lines.push(
        "Live insight pulses:",
        ...realtimeInsights.slice(0, 3).map((insight) => `• ${insight.summary ?? insight.title ?? ""}`),
      );
    }
    if (realtime?.monitoring) {
      const monitoringSummary = describeMonitoring(realtime.monitoring);
      if (monitoringSummary) {
        lines.push(`Live stability signal: ${monitoringSummary}`);
      }
    }
  }

  const patternSummary = describePatternSnapshot(patternSnapshot);
  if (patternSummary) {
    lines.push(patternSummary);
  }

  if (lines.length === 0) return "";
  return lines.join("\n\n");
}

type PickInsightParams = {
  memory: MemoryProfile | null;
  realtime?: RealtimeDeliveryMeta | null;
};

export async function pickInsightForConversation({
  memory,
  realtime,
}: PickInsightParams): Promise<{ summary: string } | null> {
  // Load admin automation toggles
  let insightInjection = true; // Default enabled
  try {
    const { loadActiveAdminAIConfig } = await import("@/lib/admin/adminConfig");
    const adminConfig = await loadActiveAdminAIConfig().catch(() => null);
    insightInjection = adminConfig?.automation?.insightInjection ?? true;
  } catch {
    // Silent fail - use default
  }

  // If insight injection is disabled, return null
  if (!insightInjection) {
    return null;
  }

  const realtimeInsight = realtime?.insights?.[0];
  if (realtimeInsight) {
    return {
      summary: realtimeInsight.summary ?? realtimeInsight.title ?? "",
    };
  }

  const memoryInsight =
    memory?.insights?.patterns?.[0]?.description ??
    memory?.insights?.patterns?.[0]?.label ??
    null;

  if (memoryInsight) {
    return {
      summary: memoryInsight,
    };
  }

  return null;
}

async function buildBridgePersonaInstruction(
  realtime?: RealtimeDeliveryMeta | null,
  persona?: PersonaSnapshot | null,
): Promise<string | null> {
  const candidateVoice =
    (persona?.voiceModel as string | undefined) ?? realtime?.voiceId ?? DEFAULT_VELLA_VOICE_ID;
  const voiceModel = normalizeVellaVoiceId(candidateVoice) ?? DEFAULT_VELLA_VOICE_ID;
  const toneStyle = persona?.toneStyle ?? "soft";
  const relationshipMode = persona?.relationshipMode ?? "best_friend";
  const moodState: MoodState = realtime?.moodState ?? "neutral";
  const delivery = computeDeliveryHints({
    voiceId: voiceModel,
    moodState,
    emotionalState: realtime?.emotionalState,
  });

  const settings: VellaSettings = {
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
  };

  try {
    return await buildPersonaInstruction({
      voiceId: voiceModel,
      moodState,
      delivery,
      relationshipMode,
      userSettings: settings,
      behaviourVector: realtime?.behaviourVector ?? null,
      language: persona?.language ?? realtime?.language ?? "en",
      emotionalState: realtime?.emotionalState,
      healthState: realtime?.healthState,
    });
  } catch (error) {
    // silent fallback
    return null;
  }
}

function describeMonitoring(snapshot: RealtimeDeliveryMeta["monitoring"]) {
  if (!snapshot) return "";
  const segments: string[] = [];
  segments.push(`risk ${formatLevel(snapshot.riskLevel)}`);
  segments.push(`fatigue ${formatLevel(snapshot.fatigueLevel)}`);
  segments.push(`clarity ${(snapshot.clarity * 100).toFixed(0)}%`);
  return segments.join(" • ");
}

function formatLevel(value?: number | null) {
  if (value == null) return "low";
  if (value >= 0.66) return "high";
  if (value >= 0.33) return "medium";
  return "low";
}

function describePatternSnapshot(snapshot?: PatternClientResult | null) {
  if (!snapshot) return null;
  const { patterns } = snapshot;
  if (!patterns) {
    return null;
  }

  const segments: string[] = [];
  if (patterns.commonPrimaryEmotions?.length) {
    segments.push(`emotions like ${patterns.commonPrimaryEmotions.slice(0, 3).join(", ")}`);
  }
  if (patterns.commonTriggers?.length) {
    segments.push(`often sparked by ${patterns.commonTriggers.slice(0, 3).join(", ")}`);
  }
  if (patterns.commonFears?.length) {
    segments.push(`fears of ${patterns.commonFears.slice(0, 3).join(", ")}`);
  }
  if (patterns.emotionalTendencies?.length) {
    segments.push(`tendencies toward ${patterns.emotionalTendencies.slice(0, 2).join(", ")}`);
  }
  const summary =
    segments.length > 0
      ? segments.join("; ")
      : "Not enough consistent signals yet—keep logging check-ins.";

  return `Recent pattern pulse: ${summary}`;
}

