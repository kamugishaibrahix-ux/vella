import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type { VellaSettings } from "@/lib/settings/vellaSettings";
import type { EmotionalMemorySnapshot } from "@/lib/memory/types";

import {
  createRealtimeVellaClient,
  type RealtimeVellaClient,
  type RealtimeVellaEvent,
} from "./realtimeClient";
import { injectBreathOverlay, type BreathStyleKey } from "./breathPatterns";
import { isNarrativeMode } from "./narrativeDetector";
import { logVoiceTelemetry } from "@/lib/telemetry/voiceTelemetry";
import { recordUsage } from "@/lib/budget/usageEngine";
import { computePersonaHash } from "@/lib/utils/personaHash";
import { DEFAULT_VELLA_VOICE_ID, type VellaVoiceId } from "@/lib/voice/vellaVoices";
import {
  computeDeliveryHints,
  type VellaDeliveryContext,
  type VellaDeliveryHints,
  type MoodState,
} from "./deliveryEngine";
import {
  clampEmotionalState,
  createBaselineEmotionalState,
  type EmotionalState,
  type RelationshipMode,
} from "./emotion/state";
import { updateEmotionalState } from "./emotion/engine";
import { createInitialHealthState, type HealthState } from "./health/state";
import { applyHealthGuardrails, updateHealthState } from "./health/engine";
import { blendPersonaProfile } from "@/lib/ai/persona/blending";
import type { ToneProfileKey } from "@/lib/ai/persona/toneProfiles";
import { selectMusicProfile } from "@/lib/audio/musicEngine";
import { getPresetById, findPresetByIntentText } from "@/lib/audio/vellaAudioCatalog";
import { planResponse } from "@/lib/ai/scaffold/planningEngine";
import { buildDeepResponse } from "@/lib/ai/scaffold/deepResponse";
import type { ResponsePlan } from "@/lib/ai/scaffold/responseTemplate";
import { detectLanguage } from "@/lib/ai/language/detectLanguage";
import { LANGUAGE_PROFILES, type SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import type { InsightSnapshot } from "@/lib/insights/types";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import { selectIntelligenceItems } from "@/lib/marketplace/selector";
import type { IntelligenceItem } from "@/lib/marketplace/types";
import { logAuditEvent } from "@/lib/audit/logger";
import { markSafetyIntervention } from "@/lib/safety/markers";
import { filterUnsafeContent } from "@/lib/safety/complianceFilter";
import { createBackupSnapshot, type BackupSnapshot } from "@/lib/incidents/backup";
import { restoreFromBackup } from "@/lib/incidents/restore";
import { reportIncident } from "@/lib/incidents/reporter";
import type { IncidentRecord } from "@/lib/incidents/types";
import {
  computeMonitoringSnapshot,
  type MonitoringTurn,
} from "@/lib/monitor/engine";
import { getPredictiveAlerts } from "@/lib/monitor/alerts";
import type { MonitoringSnapshot } from "@/lib/monitor/types";
import { useVellaContext } from "./VellaProvider";
import { mapPlanToTier } from "@/lib/tiers/mapPlanToTier";
import type { VellaAudioResponse, VellaAudioRequest } from "@/lib/audio/vellaAudioTypes";
import { updateBehaviourVectorLocal } from "@/lib/memory/localMemory";
import { z } from "zod";
import { buildPersonaInstruction } from "./personaSynth";
import { resolveRealtimeRendererVoice } from "@/lib/voice/vellaVoices";
import { VELLA_REALTIME_VOICE_CONFIG } from "./vellaRealtimeConfig";

/**
 * DATA-DESIGN: This module must comply with /DATA_DESIGN.md.
 * - Supabase usage is restricted to metadata only (see "Supabase Usage (Metadata Only)").
 * - No user free-text content may be persisted in Supabase.
 */

export type VoiceStageState = "idle" | "listening" | "thinking" | "speaking";

export interface RealtimeVellaState {
  connected: boolean;
  stage: VoiceStageState;
  error: string | null;
  micLevel: number;
}

export type AudioIntentOptions = {
  text: string;
  planTier: PlanTier;
  connectionDepth?: number | null;
  emotionHint?: string | null;
  toneHint?: string | null;
  timeOfDay?: string | null;
};

type GeneratePresetAudioOptions = Omit<AudioIntentOptions, "text"> & {
  presetId: string;
  intent?: string;
};

export interface RealtimeAudioControls {
  canUseAudio(planName?: string | null): boolean;
  handleAudioIntentFromText(options: AudioIntentOptions): Promise<VellaAudioResponse | null>;
}

export interface RealtimeVellaControls {
  startSession(options?: { enableMic?: boolean }): Promise<void>;
  stopSession(reason?: "stopSession" | "switch-to-text"): Promise<void>;
  sendTextMessage(text: string): void;
  audio: RealtimeAudioControls;
}

type PlanTier = "free" | "pro" | "elite";

type RealtimeCleanupReason =
  | "stopSession"
  | "remote_disconnected"
  | "remote_error"
  | "unmount"
  | "switch-to-text";

type ExtendedRealtimeEvent =
  | RealtimeVellaEvent
  | { type: "state"; stage: VoiceStageState }
  | { type: "audio_level"; value?: number }
  | { type: "final_transcript"; text?: string }
  | { type: "assistant_message"; text?: string }
  | { type: "partial_transcript"; text?: string }
  | { type: "fallback_to_text"; reason: string };

export interface RealtimeBudgetSnapshot {
  elapsedSeconds: number;
  estimatedTokens: number;
  estimatedCostUSD: number;
}

type NormalizedInsight = {
  title: string;
  summary: string;
};

const InsightSchema = z.object({
  title: z.string(),
  summary: z.string(),
});

const InsightsPayload = z.object({
  patterns: z.array(InsightSchema),
});

function normalizeRealtimeInsights(raw: unknown): NormalizedInsight[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    const validated = z.array(InsightSchema).safeParse(raw);
    if (!validated.success) {
      if (process.env.NODE_ENV === "development") {
        console.warn("realtime-insights: invalid payload");
      }
      return [];
    }
    return validated.data;
  }
  const parsed = InsightsPayload.safeParse(raw);
  if (!parsed.success) {
    if (process.env.NODE_ENV === "development") {
      console.warn("realtime-insights: invalid payload");
    }
    return [];
  }
  return parsed.data.patterns;
}

export interface RealtimeDeliveryMeta {
  voiceId: VellaVoiceId;
  moodState: MoodState;
  deliveryHints?: VellaDeliveryHints;
  emotionalState?: EmotionalState;
  healthState?: HealthState;
  musicMode?: string;
  responsePlan?: ResponsePlan | null;
  language?: SupportedLanguage;
  insights?: NormalizedInsight[];
  monitoring?: MonitoringSnapshot;
  predictiveAlerts?: string[];
  behaviourVector?: BehaviourVector | null;
  lastBackupAt?: number | null;
  lastRestoreAt?: number | null;
  lastIncident?: {
    id: string;
    type: string;
    timestamp: number;
  } | null;
}

interface UseRealtimeVellaOptions {
  planTier?: PlanTier;
  voiceId?: VellaVoiceId;
  relationshipMode?: RelationshipMode;
  userSettings?: VellaSettings | null;
  emotionalMemory?: EmotionalMemorySnapshot | null;
  insights?: InsightSnapshot | null;
  behaviourVector?: BehaviourVector | null;
  onUserUtterance?: (text: string) => void | Promise<void>;
  onAssistantMessage?: (text: string) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  breathStyle?: BreathStyleKey;
  userId?: string | null;
  onLanguageResolved?: (language: SupportedLanguage) => void | Promise<void>;
}

const createDefaultRealtimeState = (): RealtimeVellaState => ({
  connected: false,
  stage: "idle",
  error: null,
  micLevel: 0,
});

const ASSISTANT_TOKENS_PER_SECOND = 6;
const USER_TOKENS_PER_SECOND = 4;
const TOKENS_PER_SECOND = ASSISTANT_TOKENS_PER_SECOND + USER_TOKENS_PER_SECOND;
const COST_PER_TOKEN_USD = 0.00000015;
const BUDGET_INTERVAL_MS = 3000;
const DEFAULT_BUDGET_SNAPSHOT: RealtimeBudgetSnapshot = {
  elapsedSeconds: 0,
  estimatedTokens: 0,
  estimatedCostUSD: 0,
};
const SOFT_TONE_KEYWORDS = ["whisper", "talk softly", "soft tone", "quietly", "comfort me", "asmr", "hushed"];

type DerivedMoodState = "calm" | "bright" | "soothing" | "thinking";

type EmotionalMemorySamplePayload = {
  valence: number;
  warmth: number;
  curiosity: number;
  tension: number;
};

const normalizeSupportedLanguage = (value?: string | null): SupportedLanguage => {
  if (value && value in LANGUAGE_PROFILES) {
    return value as SupportedLanguage;
  }
  return "en";
};

function deriveMoodStateFromEmotion(state: EmotionalState): DerivedMoodState {
  if (state.tension > 0.6 || state.valence < -0.2) return "soothing";
  if (state.arousal > 0.6 && state.valence > 0.1) return "bright";
  if (state.arousal < 0.3 && state.warmth > 0.4) return "calm";
  return "thinking";
}

function mapDerivedMoodToDeliveryState(value: DerivedMoodState): MoodState {
  switch (value) {
    case "bright":
      return "uplifting";
    case "soothing":
      return "soothing";
    case "calm":
      return "neutral";
    case "thinking":
    default:
      return "grounding";
  }
}

export function useRealtimeVella(options: UseRealtimeVellaOptions = { planTier: "free" }): [
  RealtimeVellaState,
  RealtimeBudgetSnapshot,
  RealtimeVellaControls,
  RealtimeDeliveryMeta | null,
] {
  const {
    planTier = "free",
    voiceId = DEFAULT_VELLA_VOICE_ID,
    relationshipMode: relationshipModeOverride,
    userSettings: personaSettings = null,
    emotionalMemory = null,
    insights: incomingInsights = null,
    behaviourVector: incomingBehaviourVector = null,
    onUserUtterance,
    onAssistantMessage,
    onError,
    breathStyle = "calm",
    userId = null,
    onLanguageResolved,
  } = options ?? {};
  const relationshipMode =
    relationshipModeOverride ?? personaSettings?.relationshipMode ?? "best_friend";

  const [state, setState] = useState<RealtimeVellaState>(() => createDefaultRealtimeState());
  const stateRef = useRef<RealtimeVellaState>(state);

  const mountedRef = useRef(false);
  const clientRef = useRef<RealtimeVellaClient | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const connectingRef = useRef(false);
  const connectedRef = useRef(false);
  const sessionIdRef = useRef(0);
  const lastAssistantMessageRef = useRef<string>("");
  const breathStyleRef = useRef<BreathStyleKey>(breathStyle);
  const relationshipModeRef = useRef<RelationshipMode>(relationshipMode);
  const personaSettingsRef = useRef<VellaSettings | null>(personaSettings);
  const personaMemoryRef = useRef<EmotionalMemorySnapshot | null>(emotionalMemory ?? null);
  const sessionStartAtRef = useRef<number | null>(null);
  const budgetIntervalRef = useRef<number | null>(null);
  const asmrTurnsRef = useRef(0);
  const healthStateRef = useRef<HealthState>(createInitialHealthState());
  const responsePlanRef = useRef<ResponsePlan | null>(null);
  const lastUserTextRef = useRef<string>("");
  const sessionModeRef = useRef<"text" | "voice">("text");
  // Language is auto-detected from user input, default to English initially
  const languageRef = useRef<SupportedLanguage>("en");
  const insightsRef = useRef<InsightSnapshot | null>(incomingInsights);
  const behaviourVectorRef = useRef<BehaviourVector | null>(incomingBehaviourVector);
  const intelligenceItemsRef = useRef<IntelligenceItem[]>([]);
  const backupRef = useRef<BackupSnapshot | null>(null);
  const emotionalStateRef = useRef<EmotionalState>(
    createBaselineEmotionalState(relationshipMode, {}, personaMemoryRef.current),
  );
  const initialMusicMode = selectMusicProfile(emotionalStateRef.current);
  const deliveryContextRef = useRef<VellaDeliveryContext>({
    voiceId,
    moodState: "neutral",
    lastUserEmotion: null,
    emotionalState: emotionalStateRef.current,
    musicMode: initialMusicMode,
  });
  const moodStateRef = useRef<MoodState>("neutral");
  const emotionalSamplesRef = useRef<EmotionalMemorySamplePayload[]>([]);
  const lastBackupAtRef = useRef<number | null>(null);
  const lastRestoreAtRef = useRef<number | null>(null);
  const lastIncidentRef = useRef<{ id: string; type: string; timestamp: number } | null>(null);
  const recentTurnsRef = useRef<MonitoringTurn[]>([]);
  const [deliveryMeta, setDeliveryMeta] = useState<RealtimeDeliveryMeta | null>(null);
  const deliveryMetaRef = useRef<RealtimeDeliveryMeta | null>(null);
  const lastPersonaSessionConfigRef = useRef<{
    instructions: string;
    voice: string;
    personaHash?: string;
  } | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const deviceChangeHandlerRef = useRef<(() => void) | null>(null);
  const hasAttemptedTextFallbackRef = useRef(false);
  const fallbackToTextModeRef = useRef<((reason: string) => Promise<boolean>) | null>(
    null,
  );
  const reconnectSessionRef = useRef<((reason: string) => Promise<void>) | null>(null);
  const appendMonitoringTurn = useCallback((turn: MonitoringTurn) => {
    recentTurnsRef.current = [...recentTurnsRef.current, turn].slice(-20);
  }, []);
  const buildDefaultMonitoringSnapshot = (): MonitoringSnapshot => ({
    timestamp: Date.now(),
    valence: 0,
    arousal: 0,
    tension: 0,
    tensionLoad: 0,
    driftScore: 0,
    clarity: 1,
    avgTurnLength: 0,
    turnPerMinute: 0,
    strategy: responsePlanRef.current?.intent ?? "idle",
    relationshipMode: relationshipModeRef.current ?? "companion",
    riskLevel: 0,
    fatigueLevel: 0,
  });
  const buildDeliveryMetaSkeleton = useCallback(
    (overrides?: Partial<RealtimeDeliveryMeta>): RealtimeDeliveryMeta => {
      const {
        deliveryHints,
        responsePlan,
        language,
        insights,
        monitoring,
        predictiveAlerts,
        ...rest
      } = overrides ?? {};
      const resolvedInsights =
        insights ??
        insightsRef.current ??
        ({
          patterns: [],
          lastComputed: Date.now(),
        } as InsightSnapshot);
      const normalizedInsights = normalizeRealtimeInsights(resolvedInsights);
      const resolvedMonitoring = monitoring ?? buildDefaultMonitoringSnapshot();
      return {
        voiceId: deliveryContextRef.current.voiceId,
        moodState: deliveryContextRef.current.moodState,
        deliveryHints: deliveryHints ?? undefined,
        emotionalState: emotionalStateRef.current,
        healthState: healthStateRef.current,
        musicMode: deliveryContextRef.current.musicMode ?? undefined,
        responsePlan: responsePlan ?? responsePlanRef.current ?? undefined,
        language: language ?? languageRef.current ?? "en",
        insights: normalizedInsights,
        monitoring: resolvedMonitoring,
        predictiveAlerts: predictiveAlerts ?? [],
        behaviourVector: behaviourVectorRef.current,
        lastBackupAt: lastBackupAtRef.current,
        lastRestoreAt: lastRestoreAtRef.current,
        lastIncident: lastIncidentRef.current,
        ...rest,
      };
    },
    [],
  );

  const safeSetState = useCallback(
    (updater: (prev: RealtimeVellaState) => RealtimeVellaState) => {
      if (!mountedRef.current) return;
      setState((prev) => {
        const next = updater(prev);
        if (
          next.connected === prev.connected &&
          next.stage === prev.stage &&
          next.error === prev.error &&
          next.micLevel === prev.micLevel
        ) {
          stateRef.current = prev;
          return prev;
        }
        stateRef.current = next;
        if (process.env.NODE_ENV === "development") {
          console.log("[Realtime Hook] state change", { from: prev, to: next });
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    breathStyleRef.current = breathStyle;
  }, [breathStyle]);


  const [realtimeBudget, setRealtimeBudget] = useState<RealtimeBudgetSnapshot>(
    () => DEFAULT_BUDGET_SNAPSHOT,
  );

  const updateBudgetSnapshot = useCallback(() => {
    const startedAt = sessionStartAtRef.current;
    if (!startedAt) {
      setRealtimeBudget((prev) =>
        prev.elapsedSeconds === 0 && prev.estimatedTokens === 0 && prev.estimatedCostUSD === 0
          ? prev
          : DEFAULT_BUDGET_SNAPSHOT,
      );
      return;
    }
    const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
    const estimatedTokens = elapsedSeconds * TOKENS_PER_SECOND;
    const estimatedCostUSD = estimatedTokens * COST_PER_TOKEN_USD;
    setRealtimeBudget((prev) => {
      if (
        prev.elapsedSeconds === elapsedSeconds &&
        prev.estimatedTokens === estimatedTokens &&
        prev.estimatedCostUSD === estimatedCostUSD
      ) {
        return prev;
      }
      return {
        elapsedSeconds,
        estimatedTokens,
        estimatedCostUSD,
      };
    });
  }, []);

  const stopBudgetTracking = useCallback(
    (reset?: boolean) => {
      if (budgetIntervalRef.current != null) {
        window.clearInterval(budgetIntervalRef.current);
        budgetIntervalRef.current = null;
      }
      if (reset) {
        setRealtimeBudget(DEFAULT_BUDGET_SNAPSHOT);
      }
    },
    [setRealtimeBudget],
  );

  const startBudgetTracking = useCallback(() => {
    if (budgetIntervalRef.current != null) {
      return;
    }
    updateBudgetSnapshot();
    budgetIntervalRef.current = window.setInterval(() => {
      updateBudgetSnapshot();
    }, BUDGET_INTERVAL_MS);
  }, [updateBudgetSnapshot]);

  const computeEmotionAwareDeliveryHints = useCallback(() => {
    const derived = deriveMoodStateFromEmotion(emotionalStateRef.current);
    const mapped = mapDerivedMoodToDeliveryState(derived);
    const effectiveMood = asmrTurnsRef.current > 0 ? "soothing" : mapped;
    moodStateRef.current = effectiveMood;
    deliveryContextRef.current.moodState = effectiveMood;
    deliveryContextRef.current.emotionalState = emotionalStateRef.current;
    const musicMode = selectMusicProfile(emotionalStateRef.current);
    deliveryContextRef.current.musicMode = musicMode;

    const toneKey = (
      personaSettingsRef.current?.toneStyle ??
      personaSettingsRef.current?.tone ??
      "soft"
    ) as ToneProfileKey;
    const relationshipForBlend =
      personaSettingsRef.current?.relationshipMode ?? relationshipModeRef.current;
    const blended = blendPersonaProfile(toneKey, relationshipForBlend, emotionalStateRef.current);

    deliveryContextRef.current.speakingRateHint =
      blended.cadence === "slow" ? "slow" : blended.cadence === "fast" ? "fast" : undefined;
    deliveryContextRef.current.softnessHint =
      blended.directness < 0.35
        ? "soft"
        : blended.directness > 0.75
          ? "crisp"
          : undefined;

    let hints = computeDeliveryHints(deliveryContextRef.current);
    const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

    const adjustBreaths = (delta: number) => {
      hints = {
        ...hints,
        breathHints: {
          ...hints.breathHints,
          averageSentenceBreaths: clamp(
            hints.breathHints.averageSentenceBreaths + delta,
            0.2,
            1.6,
          ),
          maxBreathsPerTurn: Math.max(
            1,
            Math.min(6, hints.breathHints.maxBreathsPerTurn + Math.round(delta * 4)),
          ),
        },
      };
    };

    if (blended.cadence === "slow") {
      hints = { ...hints, targetRate: clamp(hints.targetRate - 0.15, 0.2, 0.95) };
      adjustBreaths(0.1);
    } else if (blended.cadence === "fast") {
      hints = { ...hints, targetRate: clamp(hints.targetRate + 0.15, 0.2, 0.95) };
    }

    if (blended.directness < 0.3) {
      adjustBreaths(0.08);
    }

    if (blended.warmth > 0.7) {
      hints = { ...hints, expressionBloom: "high" };
    }

    if (emotionalStateRef.current.tension > 0.65) {
      adjustBreaths(0.05);
    }

    const langProfile = LANGUAGE_PROFILES[languageRef.current] ?? LANGUAGE_PROFILES.en;
    if (langProfile.formality > 0.7) {
      hints = { ...hints, targetRate: clamp(hints.targetRate - 0.05, 0.2, 0.95) };
      adjustBreaths(0.04);
    } else if (langProfile.formality < 0.4) {
      hints = { ...hints, expressionBloom: "high" };
    }

    const activePlan = responsePlanRef.current;
    if (activePlan?.emotionalGoal === "comfort") {
      hints = { ...hints, targetRate: clamp(hints.targetRate - 0.1, 0.2, 0.95) };
      adjustBreaths(0.05);
    } else if (activePlan?.emotionalGoal === "engage") {
      hints = { ...hints, targetRate: clamp(hints.targetRate + 0.05, 0.2, 0.95) };
    }

    switch (activePlan?.intent) {
      case "offer_reflection":
        hints = {
          ...hints,
          targetRate: clamp(hints.targetRate * 0.9, 0.2, 0.95),
          targetSoftness: clamp(0.8, 0, 1),
        };
        break;
      case "give_clarity":
        hints = {
          ...hints,
          targetRate: clamp(hints.targetRate * 1.05, 0.2, 0.95),
          targetSoftness: clamp(0.4, 0, 1),
        };
        break;
      case "ask_followup":
        hints = {
          ...hints,
          targetRate: clamp(hints.targetRate * 1.1, 0.2, 0.95),
          targetWarmth: clamp(hints.targetWarmth + 0.05, 0, 1),
        };
        break;
      case "summarise":
        hints = { ...hints, targetRate: clamp(hints.targetRate * 0.95, 0.2, 0.95) };
        break;
      case "probe_gently":
        hints = { ...hints, targetSoftness: clamp(0.75, 0, 1) };
        break;
      default:
        break;
    }

    return hints;
  }, []);

  const recordEmotionalSample = useCallback(() => {
    emotionalSamplesRef.current.push({
      valence: emotionalStateRef.current.valence,
      warmth: emotionalStateRef.current.warmth,
      curiosity: emotionalStateRef.current.curiosity,
      tension: emotionalStateRef.current.tension,
    });
    if (emotionalSamplesRef.current.length > 180) {
      emotionalSamplesRef.current.shift();
    }
  }, []);

  const applyHealthAdjustments = useCallback(
    (assistantText?: string | null) => {
      healthStateRef.current = updateHealthState(
        healthStateRef.current,
        emotionalStateRef.current,
        assistantText ?? null,
      );
      let patched = applyHealthGuardrails(healthStateRef.current, emotionalStateRef.current);

      if (healthStateRef.current.fatigue > 1) {
        patched.curiosity -= 0.15;
        patched = clampEmotionalState(patched);
        moodStateRef.current = mapDerivedMoodToDeliveryState("calm");
        deliveryContextRef.current.moodState = moodStateRef.current;
      }

      if (healthStateRef.current.tensionLoad > 0.8) {
        asmrTurnsRef.current = Math.max(asmrTurnsRef.current, 2);
        logAuditEvent(
          markSafetyIntervention("High tension load triggered grounding adjustments"),
        );
      }

      emotionalStateRef.current = patched;
      logAuditEvent({
        type: "HEALTH_UPDATE",
        timestamp: Date.now(),
        outcome: "health_update",
      });
    },
    [],
  );

  const updatePersonaSnapshot = useCallback(
    (opts?: { skipClient?: boolean }) => {
      const intelligenceItems = selectIntelligenceItems({
        emotionalState: emotionalStateRef.current,
        insights: insightsRef.current ?? undefined,
        language: languageRef.current,
      });
      intelligenceItemsRef.current = intelligenceItems;

      const hints = computeEmotionAwareDeliveryHints();
      backupRef.current = createBackupSnapshot({
        emotionalState: emotionalStateRef.current,
        healthState: healthStateRef.current,
        behaviourVector: behaviourVectorRef.current,
        insights: insightsRef.current,
        relationshipMode: relationshipModeRef.current,
        language: languageRef.current,
      });
      lastBackupAtRef.current = Date.now();
        const nextMeta = buildDeliveryMetaSkeleton({
            deliveryHints: hints,
        });
        deliveryMetaRef.current = nextMeta;
        setDeliveryMeta(nextMeta);
      if (!opts?.skipClient && clientRef.current) {
        const baseSettings = personaSettingsRef.current;
        clientRef.current.updatePersona({
          voiceId: deliveryContextRef.current.voiceId,
          moodState: deliveryContextRef.current.moodState,
          delivery: hints,
          relationshipMode: relationshipModeRef.current,
          emotionalState: emotionalStateRef.current,
          userSettings: baseSettings ?? undefined,
          emotionalMemory: personaMemoryRef.current ?? undefined,
          healthState: healthStateRef.current,
          responsePlan: responsePlanRef.current ?? undefined,
          userText: lastUserTextRef.current,
          insights: insightsRef.current ?? undefined,
          behaviourVector: behaviourVectorRef.current ?? undefined,
          intelligenceItems: intelligenceItemsRef.current,
          language: languageRef.current,
        });
      }
      return hints;
    },
    [buildDeliveryMetaSkeleton, computeEmotionAwareDeliveryHints],
  );

  const updateDeliveryContext = useCallback(
    (updates: Partial<VellaDeliveryContext>, opts?: { refreshPersona?: boolean }) => {
      deliveryContextRef.current = { ...deliveryContextRef.current, ...updates };
      clientRef.current?.setDeliveryContext(deliveryContextRef.current);
      if (opts?.refreshPersona) {
        updatePersonaSnapshot();
      } else {
        setDeliveryMeta((prev) => {
          const base = prev ?? buildDeliveryMetaSkeleton();
          return {
            ...base,
            voiceId: deliveryContextRef.current.voiceId,
            moodState: deliveryContextRef.current.moodState,
            emotionalState: emotionalStateRef.current,
            healthState: healthStateRef.current,
            musicMode: deliveryContextRef.current.musicMode ?? undefined,
            responsePlan: responsePlanRef.current ?? undefined,
            language: languageRef.current ?? "en",
            insights: normalizeRealtimeInsights(insightsRef.current ?? base.insights),
            behaviourVector: behaviourVectorRef.current ?? base.behaviourVector,
            lastBackupAt: lastBackupAtRef.current,
            lastRestoreAt: lastRestoreAtRef.current,
            lastIncident: lastIncidentRef.current,
          };
        });
      }
    },
    [buildDeliveryMetaSkeleton, updatePersonaSnapshot],
  );

  const applyUserEmotionalUpdate = useCallback(
    (text: string, distressScore?: number, isHeavyTopic?: boolean) => {
      if (!text?.trim()) return;
      emotionalStateRef.current = updateEmotionalState(emotionalStateRef.current, {
        text,
        isUser: true,
        relationshipMode: relationshipModeRef.current,
        distressScore,
        isHeavyTopic,
      });
      applyHealthAdjustments();
      updatePersonaSnapshot();
      recordEmotionalSample();
      logAuditEvent({
        type: "EMOTION_UPDATE",
        timestamp: Date.now(),
        outcome: "user",
      });
    },
    [applyHealthAdjustments, recordEmotionalSample, updatePersonaSnapshot],
  );

  const applyAssistantEmotionalUpdate = useCallback(
    (text: string) => {
      if (!text?.trim()) return;
      emotionalStateRef.current = updateEmotionalState(emotionalStateRef.current, {
        text,
        isUser: false,
        relationshipMode: relationshipModeRef.current,
      });
      applyHealthAdjustments(text);
      updatePersonaSnapshot();
      recordEmotionalSample();
      logAuditEvent({
        type: "EMOTION_UPDATE",
        timestamp: Date.now(),
        outcome: "assistant",
      });
    },
    [applyHealthAdjustments, recordEmotionalSample, updatePersonaSnapshot],
  );

  const triggerSoftToneWindow = useCallback(() => {
    asmrTurnsRef.current = 2;
    updateDeliveryContext({
      softnessHint: "soft",
      speakingRateHint: "slow",
    });
    updatePersonaSnapshot();
  }, [updateDeliveryContext, updatePersonaSnapshot]);

  const decaySoftToneWindow = useCallback(() => {
    if (asmrTurnsRef.current <= 0) {
      return;
    }
    asmrTurnsRef.current -= 1;
    if (asmrTurnsRef.current <= 0) {
      updateDeliveryContext({
        softnessHint: undefined,
        speakingRateHint: undefined,
      });
    }
    updatePersonaSnapshot();
  }, [updateDeliveryContext, updatePersonaSnapshot]);

  const recordUserMoodSample = useCallback(
    (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    if (SOFT_TONE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      triggerSoftToneWindow();
    }
    applyUserEmotionalUpdate(trimmed);
    },
    [applyUserEmotionalUpdate, triggerSoftToneWindow],
  );

  const recordAssistantMoodSample = useCallback(
    (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    applyAssistantEmotionalUpdate(trimmed);
    if (asmrTurnsRef.current > 0) {
      decaySoftToneWindow();
    }
    },
    [applyAssistantEmotionalUpdate, decaySoftToneWindow],
  );

  const flushEmotionalMemorySamples = useCallback(async () => {
    const payload = emotionalSamplesRef.current;
    emotionalSamplesRef.current = [];
    if (!userId || payload.length === 0) return;
    try {
      await fetch("/api/emotion-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, samples: payload }),
      });
    } catch (error) {
      console.error("[Realtime Hook] failed to persist emotional memory snapshot", error);
    }
  }, [userId]);

  useEffect(() => {
    updateDeliveryContext({ voiceId }, { refreshPersona: true });
  }, [voiceId, updateDeliveryContext]);

  useEffect(() => {
    personaSettingsRef.current = personaSettings;
    // Language is auto-detected from user input, no need to read from settings
    updatePersonaSnapshot();
  }, [personaSettings, updatePersonaSnapshot]);

  useEffect(() => {
    insightsRef.current = incomingInsights;
    updatePersonaSnapshot({ skipClient: true });
  }, [incomingInsights, updatePersonaSnapshot]);

  useEffect(() => {
    behaviourVectorRef.current = incomingBehaviourVector;
    updateBehaviourVectorLocal(incomingBehaviourVector ?? null);
    updatePersonaSnapshot({ skipClient: true });
  }, [incomingBehaviourVector, updatePersonaSnapshot]);

  useEffect(() => {
    personaMemoryRef.current = emotionalMemory ?? null;
    emotionalStateRef.current = createBaselineEmotionalState(
      relationshipMode,
      { lastUpdate: Date.now() },
      personaMemoryRef.current,
    );
    relationshipModeRef.current = relationshipMode;
    updatePersonaSnapshot();
    recordEmotionalSample();
  }, [relationshipMode, emotionalMemory, recordEmotionalSample, updatePersonaSnapshot]);

  const logRealtimeUsage = useCallback(
    async (reason: RealtimeCleanupReason) => {
      const startedAt = sessionStartAtRef.current;
      sessionStartAtRef.current = null;
      if (!userId || !startedAt) return;
      const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
      if (elapsedSeconds <= 0) return;
      try {
        await recordUsage(userId, {
          plan: planTier ?? "free",
          channel: "realtime_voice",
          realtimeSeconds: elapsedSeconds,
          route: reason,
        });
      } catch (error) {
        console.error("[Realtime Hook] failed to record realtime usage", error);
      }
    },
    [planTier, userId],
  );

  const hardCleanup = useCallback(
    async (reason: RealtimeCleanupReason) => {
      if (process.env.NODE_ENV === "development") {
        console.log("[Realtime Hook] hardCleanup", {
          reason,
          sessionId: sessionIdRef.current,
          wasConnected: connectedRef.current,
          stateBefore: stateRef.current ?? null,
          hasClient: Boolean(clientRef.current),
        });
      }

      logVoiceTelemetry({
        source: "realtime_hook",
        kind: reason === "remote_error" ? "error" : "info",
        code: "hard_cleanup",
        message: "Realtime hardCleanup executed.",
        context: {
          reason,
          wasConnected: connectedRef.current,
          stageBefore: stateRef.current?.stage ?? null,
          voiceModel: voiceId,
        },
      });

      stopBudgetTracking(true);
      if (reason === "switch-to-text" && process.env.NODE_ENV === "development") {
        console.log("[TEXT:SAFE] Audio pipeline disabled in text mode.");
      }
      await flushEmotionalMemorySamples();

      const unsubscribe = unsubRef.current;
      unsubRef.current = null;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (err) {
          console.warn("[Realtime Hook] unsubscribe failed", err);
        }
      }

      const client = clientRef.current;
      clientRef.current = null;
      if (client) {
        try {
          await client.disconnect();
        } catch (err) {
          console.error("[Realtime Hook] disconnect failed", err);
        }
      }

      const stream = micStreamRef.current;
      micStreamRef.current = null;
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (err) {
            console.warn("[Realtime Hook] failed to stop track", err);
          }
        });
      }

      connectedRef.current = false;
      connectingRef.current = false;

      safeSetState((prev) => ({
        ...prev,
        connected: false,
        stage: "idle",
        micLevel: 0,
        error:
          reason === "remote_error" || reason === "remote_disconnected" ? prev.error : null,
      }));

      sessionModeRef.current = "text";
      hasAttemptedTextFallbackRef.current = false; // Reset fallback flag on cleanup

      if (reason === "stopSession" || reason === "remote_disconnected" || reason === "switch-to-text") {
        await logRealtimeUsage(reason);
      } else {
        sessionStartAtRef.current = null;
      }
    },
    [flushEmotionalMemorySamples, logRealtimeUsage, safeSetState, stopBudgetTracking, voiceId],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // fire best-effort cleanup on unmount
      void hardCleanup("unmount");
    };
  }, [hardCleanup]);

  const handleEvent = useCallback(
    async (event: RealtimeVellaEvent) => {
      const extended = event as ExtendedRealtimeEvent;

      if (process.env.NODE_ENV === "development") {
        console.log("[Realtime Event]", { sessionId: sessionIdRef.current, type: extended.type });
      }

      switch (extended.type) {
        case "connected": {
          connectedRef.current = true;
          connectingRef.current = false;
          safeSetState((prev) => ({
            ...prev,
            connected: true,
            stage: "listening",
            error: null,
          }));
          startBudgetTracking();
          break;
        }
        case "disconnected": {
          console.warn("[Realtime Event] remote disconnected", extended.reason);
          logVoiceTelemetry({
            source: "realtime_hook",
            kind: "warning",
            code: "remote_disconnected",
            message: "Realtime server or peer disconnected the session.",
            context: {
              stage: stateRef.current?.stage ?? null,
            voiceModel: voiceId,
            },
          });
          const reasonLabel =
            typeof extended.reason === "string" && extended.reason.length > 0
              ? extended.reason
              : "session_closed";
          
          // AUTO-FALLBACK TO TEXT MODE: If connection failed and we're in voice mode, fallback to text
          const fallbackHandler = fallbackToTextModeRef.current;
          if (
            reasonLabel === "failed" &&
            sessionModeRef.current === "voice" &&
            !hasAttemptedTextFallbackRef.current &&
            fallbackHandler
          ) {
            const fallbackSuccess = await fallbackHandler(`RTC connection failed: ${reasonLabel}`);
            if (fallbackSuccess) {
              break; // Fallback handled, exit
            }
          }
          
          // Attempt auto-recovery for recoverable disconnection reasons
          const recoverableReasons = ["disconnected", "closed", "data_channel_closed"];
          if (recoverableReasons.includes(reasonLabel)) {
            const reconnectHandler = reconnectSessionRef.current;
            await hardCleanup("remote_disconnected");
            if (reconnectHandler) {
              void reconnectHandler(reasonLabel);
            }
          } else {
            // Non-recoverable: show error and cleanup
            safeSetState((prev) => ({
              ...prev,
              connected: false,
              stage: "idle",
              error: `Voice session ended (${reasonLabel}). Tap Start to begin again.`,
            }));
            await hardCleanup("remote_disconnected");
          }
          break;
        }
        case "error": {
          console.error("[realtime] error", extended.error);
          connectingRef.current = false;
          
          // AUTO-FALLBACK TO TEXT MODE: If it's a connection error and we're in voice mode, try fallback
          const errorMessage = extended.error instanceof Error ? extended.error.message : String(extended.error);
          const isConnectionError = 
            errorMessage.includes("WebRTC") ||
            errorMessage.includes("WebSocket") ||
            errorMessage.includes("connection") ||
            errorMessage.includes("ICE") ||
            errorMessage.includes("offer") ||
            errorMessage.includes("answer") ||
            errorMessage.includes("DataChannel");
          
          const fallbackHandler = fallbackToTextModeRef.current;
          if (
            isConnectionError &&
            sessionModeRef.current === "voice" &&
            !hasAttemptedTextFallbackRef.current &&
            fallbackHandler
          ) {
            const fallbackSuccess = await fallbackHandler(`Connection error: ${errorMessage}`);
            if (fallbackSuccess) {
              break; // Fallback handled, exit
            }
          }
          
          logVoiceTelemetry({
            source: "realtime_hook",
            kind: "error",
            code: "remote_error",
            message: "Realtime session reported an error from server or client.",
            context: {
              stage: stateRef.current?.stage ?? null,
            voiceModel: voiceId,
            },
          });
          safeSetState((prev) => ({
            ...prev,
            error: "Realtime session error. Please retry.",
          }));
          await hardCleanup("remote_error");
          if (onError) {
            await onError(extended.error);
          }
          break;
        }
        case "state": {
          safeSetState((prev) => {
            if (!extended.stage || extended.stage === prev.stage) return prev;
            return { ...prev, stage: extended.stage };
          });
          break;
        }
        case "audio_level": {
          const nextMic = Math.max(0, Math.min(1, extended.value ?? 0));
          safeSetState((prev) =>
            prev.micLevel === nextMic ? prev : { ...prev, micLevel: nextMic },
          );
          break;
        }
        case "final_transcript": {
          const transcript = extended.text?.trim();
          if (!transcript) break;
          safeSetState((prev) => ({ ...prev, stage: "thinking" }));
          recordUserMoodSample(transcript);
          lastUserTextRef.current = transcript;
          appendMonitoringTurn({
            role: "user",
            text: transcript,
            timestamp: Date.now(),
          });
          const safeUserText = await filterUnsafeContent(transcript);
          logAuditEvent({
            type: "USER_MESSAGE",
            timestamp: Date.now(),
            outcome: "user_message",
          });
          // Always auto-detect language from user input (no manual language selection)
          const detectedLanguage = detectLanguage(transcript);
          if (detectedLanguage && detectedLanguage !== languageRef.current) {
            languageRef.current = detectedLanguage;
            if (onLanguageResolved) {
              await onLanguageResolved(detectedLanguage);
            }
            updatePersonaSnapshot();
          }
          responsePlanRef.current = planResponse(
            safeUserText,
            emotionalStateRef.current,
            relationshipModeRef.current,
            insightsRef.current,
          );
          if (responsePlanRef.current) {
            logAuditEvent({
              type: "STRATEGY_CHOSEN",
              timestamp: Date.now(),
              outcome: responsePlanRef.current?.intent ?? "user_message",
            });
          }
          if (onUserUtterance) {
            await onUserUtterance(transcript);
          }
          const client = clientRef.current;
          if (client) {
            const delay = 180 + Math.min(120, transcript.length * 2);
            window.setTimeout(() => {
              try {
                client.sendTextMessage(transcript);
              } catch (err) {
                console.error("[Realtime Hook] failed to send transcript text", err);
              }
            }, delay);
          }
          break;
        }
        case "assistant_message": {
          if (!extended.text) break;
          const trimmed = extended.text.trim();
          if (trimmed.length === 0) break;
          if (!responsePlanRef.current) {
            const fallbackPlan = planResponse(
              await filterUnsafeContent(trimmed),
              emotionalStateRef.current,
              relationshipModeRef.current,
              insightsRef.current,
            );
            responsePlanRef.current = fallbackPlan;
            logAuditEvent({
              type: "STRATEGY_CHOSEN",
              timestamp: Date.now(),
              outcome: fallbackPlan?.intent ?? "assistant_fallback",
            });
          }
          const activePlan = responsePlanRef.current;
          let rewritten: string | null = null;
          try {
            rewritten = buildDeepResponse(activePlan);
          } catch (err) {
            console.warn("[ASSISTANT:HOOK] buildDeepResponse failed", err);
            rewritten = null;
          }
          const finalAssistantText = rewritten?.length ? rewritten : trimmed;
          lastAssistantMessageRef.current = finalAssistantText;
          appendMonitoringTurn({
            role: "assistant",
            text: finalAssistantText,
            timestamp: Date.now(),
          });
          logAuditEvent({
            type: "ASSISTANT_MESSAGE",
            timestamp: Date.now(),
            outcome: "assistant_message",
          });
          recordAssistantMoodSample(finalAssistantText);
          const monitoringSnapshot = computeMonitoringSnapshot({
            emotionalState: emotionalStateRef.current,
            healthState: healthStateRef.current,
            deliveryMeta: deliveryMetaRef.current ?? undefined,
            responsePlan: activePlan,
            relationshipMode: relationshipModeRef.current,
            recentTurns: recentTurnsRef.current,
          });
          const predictiveAlerts = getPredictiveAlerts(monitoringSnapshot);
          if (predictiveAlerts.length) {
            logAuditEvent({
              type: "SAFETY_INTERVENTION",
              timestamp: Date.now(),
              outcome: "alerts",
            });
          }
            setDeliveryMeta((prev) => {
              const base = prev ?? buildDeliveryMetaSkeleton();
              const next = {
                ...base,
                monitoring: monitoringSnapshot ?? base.monitoring,
                predictiveAlerts,
                behaviourVector: behaviourVectorRef.current ?? base.behaviourVector,
                lastBackupAt: lastBackupAtRef.current,
                lastRestoreAt: lastRestoreAtRef.current,
                lastIncident: lastIncidentRef.current,
              };
              deliveryMetaRef.current = next;
              return next;
            });
          if (
            healthStateRef.current.driftScore > 8 ||
            healthStateRef.current.clarity < 0.4
          ) {
          const incidentRecord: IncidentRecord = {
            id: `stability_drift_${Date.now()}`,
            type: "STABILITY_DRIFT",
            timestamp: Date.now(),
            metadata: { ...healthStateRef.current },
          };
          reportIncident(incidentRecord);
          lastIncidentRef.current = {
            id: incidentRecord.id,
            type: incidentRecord.type,
            timestamp: incidentRecord.timestamp,
          };
            const restored = restoreFromBackup(backupRef.current, {
              emotionalState: emotionalStateRef.current,
              healthState: healthStateRef.current,
            });
            emotionalStateRef.current = restored.emotionalState;
            healthStateRef.current = restored.healthState;
          lastRestoreAtRef.current = Date.now();
            updatePersonaSnapshot();
          }
          let style: BreathStyleKey = breathStyleRef.current ?? "calm";
          if (isNarrativeMode(finalAssistantText)) {
            if (process.env.NODE_ENV === "development") {
              console.log("[NarrativeDetector] narrative mode detected", {
                sessionId: sessionIdRef.current,
              });
            }
            style = "narrative";
          }
          let styled = trimmed;
          try {
            styled = injectBreathOverlay(rewritten || trimmed, style);
          } catch (err) {
            console.warn("[ASSISTANT:HOOK] injectBreathOverlay failed", err);
            styled = rewritten || trimmed;
          }
          if (onAssistantMessage) {
            try {
              await onAssistantMessage(styled);
            } catch (err) {
              console.error("[ASSISTANT:HOOK] onAssistantMessage failed", err);
            }
          } else {
            console.warn("[ASSISTANT:HOOK] onAssistantMessage missing at runtime");
          }
          break;
        }
        case "partial_transcript":
        default:
          break;
      }
    },
    [
      appendMonitoringTurn,
      buildDeliveryMetaSkeleton,
      hardCleanup,
      onAssistantMessage,
      onError,
      onLanguageResolved,
      onUserUtterance,
      recordAssistantMoodSample,
      recordUserMoodSample,
      safeSetState,
      startBudgetTracking,
      updatePersonaSnapshot,
      voiceId,
    ],
  );

  // Reconnect session helper - defined after handleEvent to avoid circular dependency
  // Note: handleEvent is captured in closure, so it doesn't need to be in dependency array
  const reconnectSession = useCallback(
    async (reason: string) => {
      if (isReconnectingRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.log("[Realtime] reconnectSession already in progress, skipping");
        }
        return;
      }

      const recoverableReasons = ["failed", "disconnected", "closed", "data_channel_closed"];
      if (!recoverableReasons.includes(reason)) {
        if (process.env.NODE_ENV === "development") {
          console.log("[Realtime] reconnectSession: reason not recoverable", reason);
        }
        return;
      }

      if (!lastPersonaSessionConfigRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.log("[Realtime] reconnectSession: no persona config to restore");
        }
        return;
      }

      const maxAttempts = 5;
      const backoffDelays = [200, 500, 1000, 2000, 5000]; // ms

      isReconnectingRef.current = true;
      reconnectAttemptRef.current = 0;

      safeSetState((prev) => ({
        ...prev,
        error: "Reconnecting...",
      }));

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        reconnectAttemptRef.current = attempt + 1;

        if (!mountedRef.current) {
          isReconnectingRef.current = false;
          return;
        }

        if (process.env.NODE_ENV === "development") {
          console.log(`[Realtime] Reconnect attempt ${attempt + 1}/${maxAttempts}`);
        }

        if (attempt > 0) {
          const delay = backoffDelays[Math.min(attempt - 1, backoffDelays.length - 1)];
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }

        if (!mountedRef.current) {
          isReconnectingRef.current = false;
          return;
        }

        try {
          const mode = sessionModeRef.current;
          const enableMic = mode === "voice";

          // Recreate client with same persona config
          const client = createRealtimeVellaClient({
            voiceId,
            initialDeliveryContext: deliveryContextRef.current,
            relationshipMode: relationshipModeRef.current,
            userSettings: personaSettingsRef.current,
            emotionalState: emotionalStateRef.current,
            emotionalMemory: personaMemoryRef.current,
            healthState: healthStateRef.current,
            responsePlan: responsePlanRef.current,
            insights: insightsRef.current ?? undefined,
            behaviourVector: behaviourVectorRef.current ?? undefined,
            intelligenceItems: intelligenceItemsRef.current,
          });
          clientRef.current = client;
          client.setDeliveryContext(deliveryContextRef.current);

          // Reattach microphone if needed
          if (enableMic && micStreamRef.current) {
            client.attachMicrophone(micStreamRef.current);
          }

          if (unsubRef.current) {
            try {
              unsubRef.current();
            } catch (err) {
              console.warn("[Realtime Hook] previous unsubscribe failed during reconnect", err);
            }
          }
          unsubRef.current = client.onEvent((evt) => {
            void handleEvent(evt);
          });

          await client.connect();

          // Restore session with preserved persona config
          const personaConfig = lastPersonaSessionConfigRef.current;
          if (mode === "text") {
            client.updateSession({
              modalities: VELLA_REALTIME_VOICE_CONFIG.modalities.filter((m) => m === "text"),
              instructions: personaConfig.instructions,
            });
          } else {
            client.updateSession({
              modalities: VELLA_REALTIME_VOICE_CONFIG.modalities,
              instructions: personaConfig.instructions,
              voice: personaConfig.voice,
              audio: {
                sampleRate: 24000,
              },
            });
          }

          // Log restored persona hash if available
          if (personaConfig.personaHash) {
            console.log("[Persona:VOICE] persona hash (reconnected):", personaConfig.personaHash);
          }

          sessionStartAtRef.current = Date.now();
          updatePersonaSnapshot();

          isReconnectingRef.current = false;
          reconnectAttemptRef.current = 0;

          safeSetState((prev) => ({
            ...prev,
            connected: true,
            stage: "listening",
            error: null,
          }));

          if (process.env.NODE_ENV === "development") {
            console.log(`[Realtime] Reconnection successful on attempt ${attempt + 1}`);
          }

          logVoiceTelemetry({
            source: "realtime_hook",
            kind: "info",
            code: "reconnection_successful",
            message: `Realtime session reconnected after ${attempt + 1} attempt(s).`,
            context: {
              attempt: attempt + 1,
              reason,
              voiceModel: voiceId,
            },
          });

          return; // Success, exit loop
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[Realtime] Reconnect attempt ${attempt + 1} failed:`, error);
          }

          if (attempt === maxAttempts - 1) {
            // All attempts exhausted
            isReconnectingRef.current = false;
            reconnectAttemptRef.current = 0;

            logVoiceTelemetry({
              source: "realtime_hook",
              kind: "error",
              code: "reconnection_failed",
              message: "Realtime session reconnection failed after all attempts.",
              context: {
                attempts: maxAttempts,
                reason,
                voiceModel: voiceId,
              },
            });

            safeSetState((prev) => ({
              ...prev,
              connected: false,
              stage: "idle",
              error: "Connection lost. Please restart the session.",
            }));

            await hardCleanup("remote_disconnected");
          }
        }
      }
    },
    [
      hardCleanup,
      // handleEvent is captured in closure, not needed in dependency array
      safeSetState,
      updatePersonaSnapshot,
      voiceId,
    ],
  );

  const startSession = useCallback(
    async (options?: { enableMic?: boolean }) => {
      const enableMic = options?.enableMic !== false;
      const mode: "voice" | "text" = enableMic ? "voice" : "text";
      if (process.env.NODE_ENV === "development") {
        console.log("[Realtime] startSession invoked", {
          connected: connectedRef.current,
          connecting: connectingRef.current,
          hasClient: Boolean(clientRef.current),
          planTier,
          mode,
        });
      }
      emotionalSamplesRef.current = [];
      healthStateRef.current = createInitialHealthState();
      responsePlanRef.current = null;
      logVoiceTelemetry({
        source: "realtime_hook",
        kind: "info",
        code: "start_session_called",
        message: "Realtime startSession invoked from UI.",
        context: {
          planTier,
          connected: connectedRef.current,
          connecting: connectingRef.current,
          hasClient: Boolean(clientRef.current),
          voiceModel: voiceId,
        },
      });

      if (!mountedRef.current) {
        console.warn("[Realtime] startSession called on unmounted hook");
        return;
      }

      if (planTier === "free" && enableMic) {
        logVoiceTelemetry({
          source: "realtime_hook",
          kind: "warning",
          code: "start_session_blocked_plan",
          message: "Realtime startSession blocked because plan tier does not allow continuous voice.",
          context: {
            planTier,
            voiceModel: voiceId,
          },
        });
        safeSetState((prev) => ({
          ...prev,
          error: "Continuous voice is available on Pro and Elite plans.",
          stage: "idle",
          connected: false,
        }));
        return;
      }

      if (connectedRef.current || connectingRef.current) {
        if (process.env.NODE_ENV === "development") {
          console.log("[Realtime] startSession ignored – already connecting/connected");
        }
        return;
      }

      connectingRef.current = true;
      sessionStartAtRef.current = null;
      safeSetState((prev) => ({
        ...prev,
        connecting: true,
        error: null,
      }));

      try {
        let stream: MediaStream | null = null;
        let effectiveMode: "voice" | "text" = mode;
        
        // DEVICE AVAILABILITY & MIC FAILOVER
        if (enableMic) {
          if (process.env.NODE_ENV === "development") {
            console.log("[Realtime] Checking device availability…");
          }

          // Step 1: Check if any audio input devices exist before requesting
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasAudioInput = devices.some((device) => device.kind === "audioinput");

            if (!hasAudioInput) {
              if (process.env.NODE_ENV === "development") {
                console.log("[Device Availability] No audio input devices found, falling back to text mode");
              }
              logVoiceTelemetry({
                source: "realtime_hook",
                kind: "warning",
                code: "no_audio_input_devices",
                message: "No audio input devices available, falling back to text mode.",
                context: {
                  voiceModel: voiceId,
                },
              });
              effectiveMode = "text";
              micStreamRef.current = null;
            } else {
              // Step 2: Request microphone access
              if (process.env.NODE_ENV === "development") {
                console.log("[Realtime] Requesting microphone…");
              }
              try {
                stream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                  },
                });
                micStreamRef.current = stream;
                if (process.env.NODE_ENV === "development") {
                  console.log("[VOICE:SAFE] Audio pipeline enabled.");
                }
              } catch (getUserMediaError) {
                // Step 3: Handle getUserMedia errors with fallback to text mode
                const error = getUserMediaError as DOMException;
                const errorName = error.name;

                if (
                  errorName === "NotAllowedError" ||
                  errorName === "NotFoundError" ||
                  errorName === "NotReadableError"
                ) {
                  if (process.env.NODE_ENV === "development") {
                    console.log(`[Device Availability] getUserMedia failed (${errorName}), falling back to text mode`);
                  }
                  logVoiceTelemetry({
                    source: "realtime_hook",
                    kind: "warning",
                    code: "mic_access_failed",
                    message: `Microphone access failed (${errorName}), falling back to text mode.`,
                    context: {
                      errorName,
                      voiceModel: voiceId,
                    },
                  });
                  effectiveMode = "text";
                  micStreamRef.current = null;
                } else {
                  // Re-throw unexpected errors
                  throw getUserMediaError;
                }
              }
            }
          } catch (enumError) {
            // If enumerateDevices fails, still try getUserMedia
            if (process.env.NODE_ENV === "development") {
              console.warn("[Device Availability] enumerateDevices failed, attempting getUserMedia anyway", enumError);
            }
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
              });
              micStreamRef.current = stream;
              if (process.env.NODE_ENV === "development") {
                console.log("[VOICE:SAFE] Audio pipeline enabled.");
              }
            } catch (getUserMediaError) {
              const error = getUserMediaError as DOMException;
              const errorName = error.name;

              if (
                errorName === "NotAllowedError" ||
                errorName === "NotFoundError" ||
                errorName === "NotReadableError"
              ) {
                if (process.env.NODE_ENV === "development") {
                  console.log(`[Device Availability] getUserMedia failed (${errorName}), falling back to text mode`);
                }
                logVoiceTelemetry({
                  source: "realtime_hook",
                  kind: "warning",
                  code: "mic_access_failed",
                  message: `Microphone access failed (${errorName}), falling back to text mode.`,
                  context: {
                    errorName,
                    voiceModel: voiceId,
                  },
                });
                effectiveMode = "text";
                micStreamRef.current = null;
              } else {
                throw getUserMediaError;
              }
            }
          }

          // If we fell back to text mode, restart session in text mode
          if (effectiveMode === "text" && enableMic) {
            connectingRef.current = false;
            if (process.env.NODE_ENV === "development") {
              console.log("[Device Availability] Restarting session in text-only mode");
            }
            // Recursively call startSession with enableMic: false
            return await startSession({ enableMic: false });
          }
        } else {
          micStreamRef.current = null;
          if (process.env.NODE_ENV === "development") {
            console.log("[TEXT:SAFE] Audio pipeline disabled in text mode.");
          }
        }

        updateDeliveryContext({ voiceId });

        const initialIntelligenceItems = selectIntelligenceItems({
          emotionalState: emotionalStateRef.current,
          insights: insightsRef.current ?? undefined,
          language: languageRef.current,
        });
        intelligenceItemsRef.current = initialIntelligenceItems;

        const personaSettingsLanguage = (
          personaSettingsRef.current as unknown as { language?: string } | null
        )?.language;
        const initialPersonaSettings = personaSettingsRef.current
          ? ({
              ...personaSettingsRef.current,
              language:
                personaSettingsLanguage === "auto"
                  ? languageRef.current
                  : personaSettingsLanguage,
            } as VellaSettings)
          : null;
        const client = createRealtimeVellaClient({
          voiceId,
          initialDeliveryContext: deliveryContextRef.current,
          relationshipMode: relationshipModeRef.current,
          userSettings: initialPersonaSettings,
          emotionalState: emotionalStateRef.current,
          emotionalMemory: personaMemoryRef.current,
          healthState: healthStateRef.current,
          responsePlan: responsePlanRef.current,
          insights: insightsRef.current ?? undefined,
          behaviourVector: behaviourVectorRef.current ?? undefined,
          intelligenceItems: intelligenceItemsRef.current,
        });
        clientRef.current = client;
        client.setDeliveryContext(deliveryContextRef.current);
        if (stream) {
        client.attachMicrophone(stream);
        }

        if (unsubRef.current) {
          try {
            unsubRef.current();
          } catch (err) {
            console.warn("[Realtime Hook] previous unsubscribe failed", err);
          }
        }
        unsubRef.current = client.onEvent((evt) => {
          void handleEvent(evt);
        });

        sessionIdRef.current += 1;
        const activeSessionId = sessionIdRef.current;

        if (process.env.NODE_ENV === "development") {
          console.log("[Realtime] Creating client and connecting WebRTC…");
          if (effectiveMode === "text") {
            console.log("[TEXT:HOOK] startSession requested for text mode");
          } else {
            console.log("[VOICE:HOOK] startSession requested for voice mode");
          }
        }
        
        // AUTO-FALLBACK TO TEXT MODE: Catch WebRTC/WebSocket connection failures
        try {
          await client.connect(); // <-- NOW we await, and connect waits for DC open
        } catch (connectError) {
          // If we're in voice mode and connection fails, fallback to text mode
          if (effectiveMode === "voice" && enableMic && !hasAttemptedTextFallbackRef.current) {
            if (process.env.NODE_ENV === "development") {
              console.log("[Auto-Fallback] client.connect() failed, attempting text mode fallback");
            }
            const errorMessage = connectError instanceof Error ? connectError.message : String(connectError);
            const fallbackSuccess = await fallbackToTextMode(`client.connect() failed: ${errorMessage}`);
            if (fallbackSuccess) {
              return; // Fallback handled, exit startSession
            }
          }
          // If fallback failed or we're already in text mode, re-throw the error
          throw connectError;
        }

        if (process.env.NODE_ENV === "development") {
          if (effectiveMode === "text") {
            console.log("[TEXT:HOOK] startSession: realtime connection established for text");
          } else {
            console.log("[VOICE:HOOK] startSession: realtime connection established for voice");
          }
        }

        // Once connected, send session update with appropriate modalities
        sessionStartAtRef.current = Date.now();
        
        // Build persona instruction
        const hints = computeEmotionAwareDeliveryHints();
        const intelligenceItems = selectIntelligenceItems({
          emotionalState: emotionalStateRef.current,
          insights: insightsRef.current ?? undefined,
          language: languageRef.current,
        });
        const baseSettings = personaSettingsRef.current;
        const instruction = await buildPersonaInstruction({
          voiceId: deliveryContextRef.current.voiceId,
          moodState: deliveryContextRef.current.moodState,
          delivery: hints,
          relationshipMode: relationshipModeRef.current,
          emotionalState: emotionalStateRef.current,
          userSettings: baseSettings ?? undefined,
          emotionalMemory: personaMemoryRef.current ?? undefined,
          healthState: healthStateRef.current,
          responsePlan: responsePlanRef.current ?? undefined,
          userText: lastUserTextRef.current,
          insights: insightsRef.current ?? undefined,
          behaviourVector: behaviourVectorRef.current ?? undefined,
          intelligenceItems: intelligenceItems,
          language: languageRef.current,
        });
        const personaHash = computePersonaHash(instruction);
        const personaSessionConfig = {
          instructions: instruction,
          voice: resolveRealtimeRendererVoice(voiceId),
          personaHash,
        };
        // Store persona config for reconnection recovery
        lastPersonaSessionConfigRef.current = personaSessionConfig;
        // Voice/model config MUST only come from VELLA_REALTIME_VOICE_CONFIG.
        // Do NOT override model/voice/modalities/output_audio_format/temperature/top_p at runtime.
        if (personaSessionConfig.personaHash) {
          console.log("[Persona:VOICE] persona hash:", personaSessionConfig.personaHash);
        }
        // Persist persona hash to Supabase logs
        if (userId && personaHash) {
          const { logPromptSignature } = await import("@/lib/supabase/usage/logPromptSignature");
          void logPromptSignature(userId, personaHash, "voice");
        }
        if (effectiveMode === "text") {
          client.updateSession({
            modalities: VELLA_REALTIME_VOICE_CONFIG.modalities.filter((m) => m === "text"),
            instructions: personaSessionConfig.instructions,
          });
        } else {
          client.updateSession({
            modalities: VELLA_REALTIME_VOICE_CONFIG.modalities,
            instructions: personaSessionConfig.instructions,
            voice: personaSessionConfig.voice,
            audio: {
              sampleRate: 24000,
            },
          });
        }
        sessionModeRef.current = effectiveMode;
        
        // Update persona for other settings (this may send additional session updates)
        updatePersonaSnapshot();

        safeSetState((prev) => ({
          ...prev,
          connecting: false,
          connected: true,
          stage: "listening",
        }));

        if (process.env.NODE_ENV === "development") {
          console.log("[Realtime] WebRTC + DataChannel connected", { sessionId: activeSessionId });
        }
      } catch (error) {
        console.error("[Realtime Hook Error] startSession", error);
        
        // AUTO-FALLBACK TO TEXT MODE: If this is a WebRTC/WebSocket error and we're in voice mode, try fallback
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isConnectionError = 
          errorMessage.includes("WebRTC") ||
          errorMessage.includes("WebSocket") ||
          errorMessage.includes("connection") ||
          errorMessage.includes("ICE") ||
          errorMessage.includes("offer") ||
          errorMessage.includes("answer") ||
          errorMessage.includes("DataChannel") ||
          errorMessage.includes("SDP");
        
        if (isConnectionError && mode === "voice" && enableMic && !hasAttemptedTextFallbackRef.current) {
          const fallbackSuccess = await fallbackToTextMode(`startSession error: ${errorMessage}`);
          if (fallbackSuccess) {
            return; // Fallback handled, exit
          }
        }
        
        logVoiceTelemetry({
          source: "realtime_hook",
          kind: "error",
          code: "mic_acquisition_failed",
          message: "Failed to acquire microphone for realtime session.",
          context: {
            planTier,
            voiceModel: voiceId,
          },
        });
        logVoiceTelemetry({
          source: "realtime_hook",
          kind: "error",
          code: "webrtc_connect_failed",
          message: "Realtime client.connect failed during startSession.",
          context: {
            planTier,
            voiceModel: voiceId,
          },
        });
        safeSetState((prev) => ({
          ...prev,
          connecting: false,
          connected: false,
          stage: "idle",
          error: error instanceof Error ? error.message : "Failed to start realtime session",
        }));
        await handleEvent({ type: "error", error });
      } finally {
      connectingRef.current = false;
      hasAttemptedTextFallbackRef.current = false; // Reset fallback flag after session attempt
      }
    },
    [
      computeEmotionAwareDeliveryHints,
      handleEvent,
      planTier,
      safeSetState,
      updateDeliveryContext,
      updatePersonaSnapshot,
      voiceId,
    ],
  );

  // AUTO-FALLBACK TO TEXT MODE: Helper function to gracefully degrade to text-only
  // Defined after startSession to avoid initialization order issues
  const fallbackToTextMode = useCallback(
    async (reason: string) => {
      if (hasAttemptedTextFallbackRef.current) {
        // Prevent infinite fallback loops
        if (process.env.NODE_ENV === "development") {
          console.log("[Auto-Fallback] Already attempted text fallback, skipping");
        }
        return false;
      }

      // Only fallback if we're currently in voice mode
      if (sessionModeRef.current !== "voice") {
        return false;
      }

      if (process.env.NODE_ENV === "development") {
        console.log(`[Auto-Fallback] WebRTC/WebSocket failed (${reason}), falling back to text mode`);
      }

      hasAttemptedTextFallbackRef.current = true;

      logVoiceTelemetry({
        source: "realtime_hook",
        kind: "warning",
        code: "webrtc_fallback_to_text",
        message: `WebRTC/WebSocket connection failed (${reason}), automatically falling back to text mode.`,
        context: {
          reason,
          voiceModel: voiceId,
        },
      });

      // Clean up current session
      await hardCleanup("switch-to-text");

      // Restart in text-only mode
      try {
        await startSession({ enableMic: false });
        // Emit fallback event for UI
        safeSetState((prev) => ({
          ...prev,
          error: null, // Clear any error since we're gracefully degrading
        }));
        // The fallback event will be handled by the UI if needed
        return true;
      } catch (fallbackError) {
        console.error("[Auto-Fallback] Failed to start text-only session", fallbackError);
        hasAttemptedTextFallbackRef.current = false;
        return false;
      }
    },
    [hardCleanup, safeSetState, startSession, voiceId],
  );

  useEffect(() => {
    fallbackToTextModeRef.current = fallbackToTextMode;
  }, [fallbackToTextMode]);

  useEffect(() => {
    reconnectSessionRef.current = reconnectSession;
  }, [reconnectSession]);

  const stopSession = useCallback(async (reason: RealtimeCleanupReason = "stopSession") => {
    if (process.env.NODE_ENV === "development") {
      console.log("[Realtime] stopSession CALLED", {
        sessionId: sessionIdRef.current,
        hasClient: Boolean(clientRef.current),
        reason,
      });
    }
    logVoiceTelemetry({
      source: "realtime_hook",
      kind: "info",
      code: "stop_session_called",
      message: "Realtime stopSession invoked from UI.",
      context: {
        hasClient: Boolean(clientRef.current),
        stage: stateRef.current?.stage ?? null,
        reason,
          voiceModel: voiceId,
      },
    });
    await hardCleanup(reason);
  }, [hardCleanup, voiceId]);

  // DEVICE AVAILABILITY & MIC FAILOVER: Register devicechange listener
  // Defined after startSession and stopSession to avoid initialization order issues
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.mediaDevices) {
      return;
    }

    const handleDeviceChange = async () => {
      if (!connectedRef.current || sessionModeRef.current !== "voice") {
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAudioInput = devices.some((device) => device.kind === "audioinput");

        if (!hasAudioInput) {
          if (process.env.NODE_ENV === "development") {
            console.log("[Device Availability] Audio input device removed, switching to text mode");
          }
          logVoiceTelemetry({
            source: "realtime_hook",
            kind: "warning",
            code: "audio_input_removed",
            message: "Audio input device removed during session, switching to text mode.",
            context: {
              voiceModel: voiceId,
            },
          });
          // Stop current session and restart in text mode
          await stopSession("switch-to-text");
          // Restart in text mode
          await startSession({ enableMic: false });
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[Device Availability] Failed to enumerate devices during devicechange", err);
        }
      }
    };

    try {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
      deviceChangeHandlerRef.current = () => {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      };
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[Device Availability] Failed to register devicechange listener", err);
      }
    }

    return () => {
      if (deviceChangeHandlerRef.current) {
        try {
          deviceChangeHandlerRef.current();
        } catch (err) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[Device Availability] Failed to remove devicechange listener", err);
          }
        }
        deviceChangeHandlerRef.current = null;
      }
    };
  }, [startSession, stopSession, voiceId]);

  const sendTextMessage = useCallback(
    (text: string) => {
    const trimmed = text?.trim();
    if (!trimmed) return;
    const client = clientRef.current;
    if (!client) return;
      appendMonitoringTurn({
        role: "user",
        text: trimmed,
        timestamp: Date.now(),
      });
    client.sendTextMessage(trimmed);
    },
    [appendMonitoringTurn],
  );

  const controls = useMemo(
    () => ({
      startSession,
      stopSession,
      sendTextMessage,
      audio: REALTIME_AUDIO_CONTROLS,
    }),
    [startSession, stopSession, sendTextMessage],
  );

  return [state, realtimeBudget, controls, deliveryMeta];
}

export const useRealtimeVellaContext = useVellaContext;

const REALTIME_AUDIO_CONTROLS: RealtimeAudioControls = {
  canUseAudio: canPlanUseAudio,
  handleAudioIntentFromText,
};

function canPlanUseAudio(planName?: string | null): boolean {
  const tier = mapPlanToTier(planName ?? "free");
  return tier === "pro" || tier === "elite";
}

async function requestPresetAudio(
  options: GeneratePresetAudioOptions,
): Promise<VellaAudioResponse | null> {
  if (options.planTier === "free") return null;
  if (typeof window === "undefined") return null;

  const preset = getPresetById(options.presetId);
  if (!preset) return null;

  const payload: VellaAudioRequest = {
    presetId: preset.id,
    mode: preset.engineMode ?? preset.mode,
    emotionHint: options.emotionHint ?? null,
    toneHint: options.toneHint ?? null,
    timeOfDay: options.timeOfDay ?? null,
    connectionDepth: options.connectionDepth ?? null,
    intent: options.intent ?? preset.description,
  };

  const response = await fetch("/api/audio/vella", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 403) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "audio_generation_failed");
  }

  const data = (await response.json()) as VellaAudioResponse;
  if (!data?.audioBase64) {
    throw new Error("invalid_audio_payload");
  }

  return data;
}

async function handleAudioIntentFromText(
  options: AudioIntentOptions,
): Promise<VellaAudioResponse | null> {
  if (options.planTier === "free") return null;
  if (typeof window === "undefined") return null;

  const trimmed = options.text?.trim();
  if (!trimmed) return null;

  const target = findPresetByIntentText(trimmed);
  if (!target) return null;

  return requestPresetAudio({
    presetId: target.id,
    planTier: options.planTier,
    connectionDepth: options.connectionDepth,
    emotionHint: options.emotionHint,
    toneHint: options.toneHint,
    timeOfDay: options.timeOfDay,
    intent: trimmed,
  });
}

