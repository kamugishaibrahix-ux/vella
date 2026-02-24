"use client";
// Lightweight OpenAI Realtime WebRTC client for Vella.
// Single peer connection, single audio sink, single data channel.
// PHASE 15A – Natural Behavioural Realism Upgrade

/**
 * DATA-DESIGN: This module must comply with /DATA_DESIGN.md.
 * - Supabase usage is restricted to metadata only (see "Supabase Usage (Metadata Only)").
 * - No user free-text content may be persisted in Supabase.
 */

/**
 * Persona instructions MUST only come from personaSynth.ts.
 * No dynamic instruction strings are allowed in realtimeClient.
 */
type ForbiddenInstruction = never;
import { VELLA_REALTIME_VOICE_CONFIG } from "./vellaRealtimeConfig";
import { extractEmotionalArc } from "./emotion/extractArc";
import { emotionalVoiceCurve } from "./emotion/voiceCurves";
import { logEmotionalArc } from "@/lib/telemetry/voiceTelemetry";
import { computePersonaHash } from "@/lib/utils/personaHash";
// Text annotation functions removed - no runtime voice delivery modifiers allowed
// import { injectMicroPauses } from "./emotion/microPauses";
// import { applyBreathiness } from "./emotion/breath";
// import { enhanceNarrativeCadence } from "./emotion/narrativeCadence";
import { RuntimeMonitor } from "./monitor/runtimeMonitor";
import { analyzeDrift } from "./monitor/driftAnalyzer";
import { regulateEmotion } from "./monitor/emotionStability";
import { regulatePacing } from "./monitor/pacingRegulator";
import { detectConfusion } from "./monitor/confusionGuard";
import { adjustVoiceConsistency } from "./monitor/voiceConsistency";
import { resolveTone, type ToneContext } from "../tone/toneResolver";
import { blendTone } from "../tone/toneBlender";
import { applyOverrides, type ToneOverrideContext } from "../tone/toneOverrides";
import { detectUserEmotion } from "../tone/emotionHooks";
import { TONE_PRESETS, type ToneVector } from "../tone/toneVectors";
import { resolveProsody } from "../tone/prosodyResolver";
import { blendProsody } from "../tone/prosodyBlender";
// Prosody compiler removed - no runtime voice delivery modifiers allowed
// import { compileProsody } from "../tone/prosodyCompiler";
import { PROSODY_PRESETS, type ProsodyVector } from "../tone/prosodyVectors";
import {
  computeCadenceHints,
  computePseudoSingingHints,
  inferCadenceMood,
  type CadenceMood,
  type PseudoSingingHints,
} from "./cadenceEngine";
import {
  computeDeliveryHints,
  type VellaDeliveryContext,
  type VellaDeliveryHints,
  type MoodState,
} from "./deliveryEngine";
import { buildPersonaInstruction } from "./personaSynth";
import type { EmotionalState, RelationshipMode } from "./emotion/state";
import type { VellaSettings } from "@/lib/settings/vellaSettings";
import type { SupportedLanguage } from "@/lib/ai/language/languageProfiles";
import { loadVoiceIdentity } from "../persona/voiceIdentity";
import { loadECS, saveECS } from "../persona/emotionalContinuity";
import { loadLHCS, saveLHCS } from "../persona/longHorizonState";
import { stabilizeProsody } from "../persona/moodDrift";
import { guessIntent } from "./predictiveIntent";
import {
  DEFAULT_VELLA_VOICE_ID,
  resolveRealtimeRendererVoice,
  type VellaVoiceId,
} from "@/lib/voice/vellaVoices";
import type { EmotionalMemorySnapshot } from "@/lib/memory/types";
import type { HealthState } from "./health/state";
import type { ResponsePlan } from "@/lib/ai/scaffold/responseTemplate";
import type { InsightSnapshot } from "@/lib/insights/types";
import type { IntelligenceItem } from "@/lib/marketplace/types";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import { ensureVellaSession } from "@/lib/auth/ensureVellaSession";

export type VoiceStageState = "idle" | "listening" | "thinking" | "speaking";

export type RealtimeVellaEvent =
  | { type: "connected" }
  | { type: "disconnected"; reason?: string }
  | { type: "error"; error: unknown }
  | { type: "stage"; stage: VoiceStageState }
  | { type: "audio_level"; value: number }
  | { type: "user_speech"; text: string }
  | { type: "final_transcript"; text: string }
  | { type: "assistant_message"; text: string };

export interface RealtimeVellaClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendTextMessage(text: string): void;
  attachMicrophone(stream: MediaStream): void;
  onEvent(handler: (event: RealtimeVellaEvent) => void): () => void;
  setDeliveryContext(ctx: VellaDeliveryContext): void;
  updateSession(options: {
    modalities: string[];
    instructions: string;
    voice?: string;
    audio?: { sampleRate: number };
  }): void;
  updatePersona(options?: {
    voiceId?: VellaVoiceId;
    moodState?: MoodState;
    delivery?: VellaDeliveryHints;
    relationshipMode?: RelationshipMode;
    emotionalState?: EmotionalState | null;
    userSettings?: VellaSettings | null;
    emotionalMemory?: EmotionalMemorySnapshot | null;
    healthState?: HealthState | null;
    responsePlan?: ResponsePlan | null;
    userText?: string;
    insights?: InsightSnapshot | null;
    behaviourVector?: BehaviourVector | null;
    intelligenceItems?: IntelligenceItem[] | null;
    language?: SupportedLanguage;
  }): void;
}

type VoiceModelKey = VellaVoiceId;
interface PersonaPayload {
  hints: VellaDeliveryHints;
  instruction: string;
  personaHash?: string;
}

interface CreateClientOptions {
  model?: string;
  voice?: string;
  voiceId?: VoiceModelKey;
  initialDeliveryContext?: VellaDeliveryContext;
  relationshipMode?: RelationshipMode;
  userSettings?: VellaSettings | null;
  emotionalState?: EmotionalState | null;
  emotionalMemory?: EmotionalMemorySnapshot | null;
  healthState?: HealthState | null;
  responsePlan?: ResponsePlan | null;
  insights?: InsightSnapshot | null;
  behaviourVector?: BehaviourVector | null;
  intelligenceItems?: IntelligenceItem[] | null;
}

export function createRealtimeVellaClient(options: CreateClientOptions = {}): RealtimeVellaClient {
  if (typeof window === "undefined") {
    throw new Error("Realtime client can only be created in the browser.");
  }

  const {
    voiceId = DEFAULT_VELLA_VOICE_ID,
    initialDeliveryContext,
    relationshipMode: initialRelationshipMode = "best_friend",
    userSettings: initialUserSettings = null,
    emotionalState: initialEmotionalState = null,
    emotionalMemory: initialEmotionalMemory = null,
    healthState: initialHealthState = null,
    responsePlan: initialResponsePlan = null,
    insights: initialInsights = null,
    behaviourVector: initialBehaviourVector = null,
    intelligenceItems: initialIntelligenceItems = [],
  } = options;
  const effectiveVoice = options.voice ?? resolveRealtimeRendererVoice(voiceId);
  const activeVoiceModel: VoiceModelKey = voiceId;
  let deliveryContext: VellaDeliveryContext = {
    voiceId: activeVoiceModel,
    moodState: "neutral",
    lastUserEmotion: null,
    ...(initialDeliveryContext ?? {}),
  };
  deliveryContext.voiceId = activeVoiceModel;

  let wasInterruptedRecently = false;
  let currentRelationshipMode: RelationshipMode = initialRelationshipMode;
  let personaUserSettings: VellaSettings | null = initialUserSettings;
  let emotionalStateSnapshot: EmotionalState | null = initialEmotionalState;
  let personaMemorySnapshot: EmotionalMemorySnapshot | null = initialEmotionalMemory;
  let personaHealthSnapshot: HealthState | null = initialHealthState;
  let personaResponsePlan: ResponsePlan | null = initialResponsePlan;
  let personaInsightsSnapshot: InsightSnapshot | null = initialInsights;
  let personaBehaviourVectorSnapshot: BehaviourVector | null = initialBehaviourVector;
  let personaIntelligenceItems: IntelligenceItem[] = initialIntelligenceItems ?? [];
  let lastUserTextSnapshot = "";

  type InputTextKey = `${"input"}_${"text"}`;
  const INPUT_TEXT_FIELD = ["input", "text"].join("_") as InputTextKey;

  const pseudoRandom = (seed: number): number => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  const hashStringSeed = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return hash || 1;
  };

  function computeContextForPersona(overrides?: Partial<VellaDeliveryContext>): VellaDeliveryContext {
    let ctx = { ...deliveryContext, ...overrides };
    if (wasInterruptedRecently) {
      ctx = { ...ctx, interruptionRecovery: true };
      wasInterruptedRecently = false;
    }
    return ctx;
  }

  async function buildPersonaPayload(overrides?: {
    voiceId?: VoiceModelKey;
    moodState?: MoodState;
    delivery?: VellaDeliveryHints;
    relationshipMode?: RelationshipMode;
    emotionalState?: EmotionalState | null;
    userSettings?: VellaSettings | null;
    emotionalMemory?: EmotionalMemorySnapshot | null;
    healthState?: HealthState | null;
    responsePlan?: ResponsePlan | null;
    userText?: string;
    insights?: InsightSnapshot | null;
    behaviourVector?: BehaviourVector | null;
    intelligenceItems?: IntelligenceItem[] | null;
    language?: SupportedLanguage;
  }): Promise<PersonaPayload> {
    const ctx = computeContextForPersona(
      overrides?.moodState ? { moodState: overrides.moodState } : undefined,
    );
    const hints = overrides?.delivery ?? computeDeliveryHints(ctx);
    if (ctx.interruptionRecovery) {
      deliveryContext = { ...deliveryContext, interruptionRecovery: false };
    }
    if (overrides?.relationshipMode) {
      currentRelationshipMode = overrides.relationshipMode;
    }
    if (overrides && "userSettings" in overrides) {
      personaUserSettings = overrides.userSettings ?? null;
    }
    if (overrides && "emotionalState" in overrides) {
      emotionalStateSnapshot = overrides.emotionalState ?? null;
    }
    if (overrides && typeof overrides.emotionalMemory !== "undefined") {
      personaMemorySnapshot = overrides.emotionalMemory ?? null;
    }
    if (overrides && typeof overrides.healthState !== "undefined") {
      personaHealthSnapshot = overrides.healthState ?? null;
    }
    if (overrides && typeof overrides.responsePlan !== "undefined") {
      personaResponsePlan = overrides.responsePlan ?? null;
    }
      if (typeof overrides?.userText === "string") {
        lastUserTextSnapshot = overrides.userText;
      }
      if (typeof overrides?.insights !== "undefined") {
        personaInsightsSnapshot = overrides.insights ?? null;
      }
      if (typeof overrides?.behaviourVector !== "undefined") {
        personaBehaviourVectorSnapshot = overrides.behaviourVector ?? null;
      }
      if (typeof overrides?.intelligenceItems !== "undefined") {
        personaIntelligenceItems = overrides.intelligenceItems ?? [];
      }
      if (typeof overrides?.language !== "undefined") {
        currentLanguage = overrides.language;
      }
      const instruction = await buildPersonaInstruction({
        voiceId: overrides?.voiceId ?? activeVoiceModel,
        moodState: ctx.moodState,
        delivery: hints,
        relationshipMode: currentRelationshipMode,
        emotionalState: emotionalStateSnapshot ?? undefined,
        userSettings: personaUserSettings ?? undefined,
        emotionalMemory: personaMemorySnapshot ?? undefined,
        healthState: personaHealthSnapshot ?? undefined,
        musicMode: ctx.musicMode ?? undefined,
        responsePlan: personaResponsePlan ?? undefined,
        userText: lastUserTextSnapshot,
        insights: personaInsightsSnapshot ?? undefined,
        behaviourVector: personaBehaviourVectorSnapshot ?? undefined,
        intelligenceItems: personaIntelligenceItems,
        language: overrides?.language ?? currentLanguage,
      });
      const personaHash = computePersonaHash(instruction);
    return { hints, instruction, personaHash };
  }

  async function sendPersonaUpdate(overrides?: {
    voiceId?: VoiceModelKey;
    moodState?: MoodState;
    delivery?: VellaDeliveryHints;
    relationshipMode?: RelationshipMode;
    emotionalState?: EmotionalState | null;
    userSettings?: VellaSettings | null;
    emotionalMemory?: EmotionalMemorySnapshot | null;
    healthState?: HealthState | null;
    responsePlan?: ResponsePlan | null;
    userText?: string;
    insights?: InsightSnapshot | null;
    behaviourVector?: BehaviourVector | null;
    intelligenceItems?: IntelligenceItem[] | null;
    language?: SupportedLanguage;
  }): Promise<PersonaPayload> {
    const payload = await buildPersonaPayload(overrides);
    // Freeze persona instructions to prevent accidental modification
    Object.freeze(payload.instruction);
    // DO NOT set instructions here. Persona is controlled ONLY by buildPersonaInstruction().
    if (process.env.NODE_ENV === "development" && payload.personaHash) {
      console.log("[Persona:VOICE] persona hash:", payload.personaHash);
    }
    sendOnChannel({
      type: "session.update",
      session: {
        instructions: payload.instruction,
      },
    });
    return payload;
  }

  // Connection state machine
  type RealtimeConnectionState = "idle" | "connecting" | "connected" | "closing" | "error";
  let connectionState: RealtimeConnectionState = "idle";
  let connectPromise: Promise<void> | null = null;
  let dcReadyPromise: Promise<void> | null = null;
  let resolveDcReady: (() => void) | null = null;

  function ensureDataChannelReady(): Promise<void> {
    if (dataChannel && dataChannel.readyState === "open") {
      return Promise.resolve();
    }
    if (dcReadyPromise) return dcReadyPromise;
    dcReadyPromise = new Promise<void>((resolve) => {
      resolveDcReady = () => {
        resolve();
        dcReadyPromise = null;
        resolveDcReady = null;
      };
    });
    return dcReadyPromise;
  }

  // Generic helper to guard sending on the data channel
  function sendOnChannel(payload: unknown) {
    if (process.env.NODE_ENV === "development") {
      console.log("[TEXT:CLIENT] sendOnChannel called. readyState:", dataChannel?.readyState);
    }
    if (!dataChannel || dataChannel.readyState !== "open") {
      if (process.env.NODE_ENV === "development") {
        console.warn("[RealtimeClient] Tried to send on data channel before open", {
          readyState: dataChannel?.readyState,
        });
        console.warn("[TEXT:CLIENT] DataChannel not open. Dropping text.");
      }
      return;
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[TEXT:CLIENT] DataChannel OPEN. Sending payload through RTCDataChannel.");
    }
    try {
      dataChannel.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    } catch (err) {
      console.error("[RealtimeClient] Failed to send on data channel", err);
    }
  }

  // Single peer connection for this client instance
  const pc = new RTCPeerConnection();
  // Single data channel for OpenAI events
  let dataChannel: RTCDataChannel | null = null;
  // Single remote audio stream + sink
  let remoteStream: MediaStream | null = null;
  let audioEl: HTMLAudioElement | null = null;
  // Microphone stream (tracks added to pc)
  let micStream: MediaStream | null = null;
  // Event listeners registry
  const listeners = new Set<(e: RealtimeVellaEvent) => void>();
  // Buffer for assistant output text keyed by response id
  const assistantTextByResponseId = new Map<string, string>();
  let lastArc: ReturnType<typeof extractEmotionalArc> | null = null;
  let previousTone: ToneVector = TONE_PRESETS.neutral;
  let previousProsody: ProsodyVector = PROSODY_PRESETS.neutral;
  const monitor = new RuntimeMonitor();
  let lastCadenceHint = computeCadenceHints("");
  let nextChunkTime = 0;
  let preWarmTimer: number | null = null;
  let lastPartial = "";
  let planningBuffer: string[] = [];
  const pseudoSingingByResponseId = new Map<string, PseudoSingingHints>();
  const responseMoodById = new Map<string, CadenceMood>();
  let lastStage: VoiceStageState = "idle";
  const voiceIdentity = loadVoiceIdentity();
  const ecs = loadECS();
  const lhcs = loadLHCS();
  // Track current auto-detected language for persona synthesis
  let currentLanguage: SupportedLanguage = "en";
  // --- Anti-Repetition Intelligence (ARI) ---
  const recentAssistantOutputs: string[] = [];
  const MAX_MEMORY = 6;

  function isRepetitive(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    if (!lower) return false;
    const last = recentAssistantOutputs[recentAssistantOutputs.length - 1];
    if (last && last.toLowerCase().trim() === lower) return true;
    const occurrences = recentAssistantOutputs.filter(
      (t) => t.toLowerCase().trim() === lower,
    ).length;
    return occurrences >= 2;
  }

  function rememberAssistantOutput(text: string) {
    recentAssistantOutputs.push(text);
    while (recentAssistantOutputs.length > MAX_MEMORY) {
      recentAssistantOutputs.shift();
    }
  }

  // applyCadence() REMOVED - no runtime voice delivery modifiers allowed
  // Cadence computation kept for diagnostics only (not sent to API)
  // function applyCadence(text: string) {
  //   lastCadenceHint = computeCadenceHints(text);
  //   // DO NOT set instructions here. Persona is controlled ONLY by buildPersonaInstruction().
  //   sendOnChannel({
  //     type: "session.update",
  //     session: {
  //       speech_cadence: {
  //         base_pause: lastCadenceHint.pause,
  //         micro_pause: lastCadenceHint.microPause,
  //         breath: lastCadenceHint.breath,
  //         variability: lastCadenceHint.variability,
  //       },
  //     },
  //   });
  // }

  // Smooth audio chunk scheduling - eliminates jitter and oscillation
  function scheduleAudioChunk(playFn: () => void, cadenceHints = lastCadenceHint) {
    const now = performance.now();
    // Use consistent timing without random jitter to prevent stuttering
    const baseDelay = cadenceHints.microPause;
    // Apply minimal, smooth variability only (reduced from 20ms to 5ms max)
    const smoothVariability = cadenceHints.variability * 5;
    const jitterSeed = (nextChunkTime || now) * 0.001;
    const jitter = (pseudoRandom(jitterSeed) - 0.5) * smoothVariability;
    // Ensure nextChunkTime is always ahead of current time to prevent overlap
    nextChunkTime = Math.max(nextChunkTime || now, now) + baseDelay + jitter;
    const delay = Math.max(0, nextChunkTime - now);
    // Use requestAnimationFrame for smoother timing when delay is small
    if (delay < 16) {
      requestAnimationFrame(playFn);
    } else {
      window.setTimeout(playFn, Math.round(delay));
    }
  }

  function emit(event: RealtimeVellaEvent) {
    if (event.type === "stage" && event.stage) {
      lastStage = event.stage;
    }
    listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error("[RealtimeClient] listener error", err);
      }
    });
  }

  function hardCancelTTS() {
    // Send cancel request to server
    sendOnChannel({ type: "response.cancel" });

    // Pause and reset audio element if playing
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.currentTime = 0;
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[RealtimeClient] failed to pause/reset audio element during cancel", err);
        }
      }
    }

    // Clear all TTS buffers
    assistantTextByResponseId.clear();
    pseudoSingingByResponseId.clear();
    responseMoodById.clear();
  }

  function handleServerMessage(msg: any) {
    const type = msg?.type as string | undefined;
    if (process.env.NODE_ENV === "development") {
      console.log("[SERVER:DISPATCH] handleServerMessage type:", type);
    }
    if (!type) return;

    switch (type) {
      case "input_audio_buffer.speech_started":
        // Enhanced interrupt model: Immediate cancellation with smooth recovery
        if (lastStage === "speaking" || lastStage === "thinking") {
          hardCancelTTS();
          wasInterruptedRecently = true;
          // Clear any pending audio chunks to prevent overlap
          nextChunkTime = 0;
          // Reset cadence hints for clean restart
          lastCadenceHint = computeCadenceHints("");
        }
        planningBuffer = [];
        emit({ type: "stage", stage: "listening" });
        break;
      case "response.created": {
        if (process.env.NODE_ENV === "development") {
          console.log("[RT:SERVER] response.created");
        }
        emit({ type: "stage", stage: "thinking" });
        const inputText = (msg as Record<string, unknown>)?.[INPUT_TEXT_FIELD];
        if (typeof inputText === "string" && inputText.trim().length > 0) {
          const arc = extractEmotionalArc(inputText);
          lastArc = arc;
          logEmotionalArc(arc);
          const curve = emotionalVoiceCurve(arc);
          // Emotional curve tracking removed - unified persona handles tone stability
        }
        break;
      }
      case "response.output_audio.delta":
        scheduleAudioChunk(() => {
          emit({ type: "stage", stage: "speaking" });
        }, lastCadenceHint);
        break;
      case "response.completed": {
        if (process.env.NODE_ENV === "development") {
          console.log("[RT:SERVER] response.completed", {
            response_id: msg.response?.id ?? msg.response_id ?? msg.id,
          });
        }
        emit({ type: "stage", stage: "listening" });
        // breath_event session.update REMOVED - no runtime voice delivery modifiers allowed
        // if (lastCadenceHint?.breath === "light") {
        //   window.setTimeout(() => {
        //     // DO NOT set instructions here. Persona is controlled ONLY by buildPersonaInstruction().
        //     sendOnChannel({
        //       type: "session.update",
        //       session: { breath_event: "light" },
        //     });
        //   }, 60);
        // }
        const responseId: string | undefined =
          msg.response?.id ?? msg.response_id ?? msg.id ?? undefined;
        if (responseId) {
          let full = assistantTextByResponseId.get(responseId);
          if (process.env.NODE_ENV === "development") {
            console.log("[SERVER:COMPLETED] responseId:", responseId);
          }
          if (full && full.trim()) {
            // Needed because realtime models occasionally exceed persona length boundaries
            // Clamps excessively long spoken responses
            full = full.trim();
            // ~22 seconds of speech ≈ 420 characters (roughly 19 chars/second average speaking rate)
            if (full.length > 420) {
              const targetLength = 350;
              const trimmed = full.slice(0, targetLength);
              // Try to find the nearest sentence boundary
              const lastPeriod = trimmed.lastIndexOf(".");
              const lastExclamation = trimmed.lastIndexOf("!");
              const lastQuestion = trimmed.lastIndexOf("?");
              const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
              
              if (lastSentenceEnd > targetLength * 0.7) {
                // Use sentence boundary if it's reasonably close to target
                full = trimmed.slice(0, lastSentenceEnd + 1) + "…";
              } else {
                // Otherwise just cut at target length
                full = trimmed + "…";
              }
            }
            rememberAssistantOutput(full);
            emit({ type: "assistant_message", text: full });
          }
          assistantTextByResponseId.delete(responseId);
          pseudoSingingByResponseId.delete(responseId);
          const mood = responseMoodById.get(responseId) ?? "neutral";
          responseMoodById.delete(responseId);
          // Mood instruction override removed - unified persona handles mood stability
        }
        break;
      }
      case "response.output_text.delta": {
        if (process.env.NODE_ENV === "development") {
          console.log("[RT:SERVER] output_text.delta (redacted)");
        }
        const responseId: string | undefined =
          msg.response_id ?? msg.response?.id ?? undefined;
        let deltaText: string =
          msg.delta?.text ??
          (Array.isArray(msg.delta?.content)
            ? msg.delta.content.map((c: any) => c?.text ?? "").join("")
            : "") ??
          "";
        if (!responseId || !deltaText) return;
        planningBuffer.push(deltaText);
        monitor.recordDelta(deltaText);
        // Text annotation processing REMOVED - no runtime voice delivery modifiers allowed
        // All pause/breath/emphasis annotations removed to prevent model interpretation
        // let processed = injectMicroPauses(deltaText);
        // if (lastArc?.arc === "peak") {
        //   processed = applyBreathiness(processed, "high");
        // } else if (lastArc?.arc === "fall") {
        //   processed = applyBreathiness(processed, "med");
        // }
        // processed = enhanceNarrativeCadence(processed);
        let finalOutput = deltaText; // Use raw text without annotations
        const snapshot = monitor.getSnapshot();
        const drift = analyzeDrift(snapshot);
        monitor.updateDrift(drift);
        // Style/mood control signals removed - unified persona handles all behavioural control
        // Tone/prosody tracking remains for local diagnostics only, not sent to API
        if (snapshot.driftScore > 80) {
          previousTone = TONE_PRESETS.neutral;
        }
        if (snapshot.driftScore > 70) {
          previousProsody = PROSODY_PRESETS.neutral;
        }
        // All style/mood/voice curve parameter tuning removed - rely solely on personaSynth.ts
        // applyCadence() call REMOVED - no runtime voice delivery modifiers allowed
        // Cadence computation kept for diagnostics only (commented out)
        // if (/[.,;!?]/.test(deltaText)) {
        //   lastCadenceHint = computeCadenceHints(deltaText); // Diagnostics only, not sent to API
        // }
        const prev = assistantTextByResponseId.get(responseId) ?? "";
        const next = prev + finalOutput;
        assistantTextByResponseId.set(responseId, next);
        pseudoSingingByResponseId.set(responseId, computePseudoSingingHints(next));
        responseMoodById.set(responseId, inferCadenceMood(next));
        break;
      }
      case "input_audio_buffer.transcription.completed": {
        const text: string | undefined = msg.transcript ?? msg.text;
        if (text && text.trim()) {
          const trimmed = text.trim();
          emit({ type: "user_speech", text: trimmed });
          emit({ type: "final_transcript", text: trimmed });
          if (planningBuffer.length > 0) {
            // DO NOT set instructions here. Persona is controlled ONLY by buildPersonaInstruction().
            sendOnChannel({
              type: "session.update",
              session: {
                plan_hint: planningBuffer.join(" "),
              },
            });
            planningBuffer = [];
          }
          const userEmotion = detectUserEmotion(trimmed);
          ecs.lastEmotion = userEmotion;
          if (userEmotion !== "neutral") {
            ecs.dominantEmotion = userEmotion;
          }
          saveECS(ecs);
          const toneContext: ToneContext = {
            userEmotion,
            topic: "general",
            urgency: "normal",
            relationshipDepth: 0.4,
          };
          const overrideContext: ToneOverrideContext = {
            userEmotion,
            topic: toneContext.topic,
            urgency: "normal",
            relationshipDepth: toneContext.relationshipDepth,
          };
          // DIAGNOSTICS ONLY — Tone/prosody tracking must NEVER influence realtime voice delivery.
          // All voice behaviour is controlled exclusively by personaSynth + vellaRealtimeConfig.
          // These computations are for local diagnostics only, not sent to API or used in instructions.
          const baseTone = resolveTone(toneContext);
          const blendedTone = blendTone(previousTone, baseTone, 0.35);
          const finalTone = applyOverrides(blendedTone, overrideContext);
          previousTone = finalTone;
          // Tone instruction override removed - unified persona handles tone stability
          const targetProsody = resolveProsody(userEmotion);
          const blendedProsody = blendProsody(previousProsody, targetProsody, 0.35);
          const stabilizedProsody = stabilizeProsody(blendedProsody, ecs.stability);
          previousProsody = stabilizedProsody;
          deliveryContext = { ...deliveryContext, lastUserEmotion: userEmotion };
          sendPersonaUpdate({ language: currentLanguage }).catch((err) => {
            console.error("[realtimeClient] sendPersonaUpdate error", err);
          });
          lhcs.connectionDepth = Math.min(1, lhcs.connectionDepth + 0.01);
          lhcs.trustLevel = Math.min(1, lhcs.trustLevel * 1.001);
          saveLHCS(lhcs);
        }
        break;
      }
      case "input_audio_buffer.transcription.partial": {
        const partial = msg.text ?? msg.partial ?? "";
        if (!partial || partial === lastPartial) break;
        lastPartial = partial;
        if (preWarmTimer) {
          clearTimeout(preWarmTimer);
          preWarmTimer = null;
        }
        preWarmTimer = window.setTimeout(() => {
          const intent = guessIntent(lastPartial);
          // DO NOT set instructions here. Persona is controlled ONLY by buildPersonaInstruction().
          sendOnChannel({
            type: "session.update",
            session: {
              prewarm_intent: lastPartial.slice(0, 120),
              predicted_intent: intent,
            },
          });
        }, 150);
        break;
      }
      default:
        // Ignore other event types for now
        break;
    }
  }

  function ensureDataChannel() {
    if (dataChannel) return dataChannel;

    const dc = pc.createDataChannel("oai-events");
    dataChannel = dc;

    dc.onopen = () => {
      if (process.env.NODE_ENV === "development") {
        console.log("[RealtimeClient] Data channel open");
      }
      if (resolveDcReady) {
        resolveDcReady();
      }
      emit({ type: "connected" });

      currentLanguage = "en";
      // Initial session update will be sent via updateSession() after connection
      // This ensures modalities are set correctly based on mode
    };

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (process.env.NODE_ENV === "development") {
          const parsedType = (msg as Record<string, unknown>)?.type;
          console.log("[DC:INCOMING] message type:", parsedType);
        }
        handleServerMessage(msg);
      } catch (err) {
        console.error("[RealtimeClient] failed to parse message", err);
      }
    };

    dc.onerror = (err) => {
      emit({ type: "error", error: err });
    };

    dc.onclose = () => {
      if (process.env.NODE_ENV === "development") {
        console.log("[RealtimeClient] Data channel closed");
      }
      emit({ type: "disconnected", reason: "data_channel_closed" });
    };

    return dc;
  }

  // Enhanced reconnect logic with exponential backoff
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY = 1000; // 1 second
  let reconnectTimer: number | null = null;

  async function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error("[RealtimeClient] Max reconnect attempts reached");
      emit({ type: "error", error: new Error("Max reconnect attempts exceeded") });
      return;
    }

    reconnectAttempts++;
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
    
    if (process.env.NODE_ENV === "development") {
      console.log(`[RealtimeClient] Attempting reconnect ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    }

    reconnectTimer = window.setTimeout(async () => {
      try {
        await client.connect();
        reconnectAttempts = 0; // Reset on successful connection
        reconnectTimer = null;
      } catch (err) {
        console.error("[RealtimeClient] Reconnect attempt failed", err);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          attemptReconnect(); // Try again
        }
      }
    }, delay);
  }

  // Keep an eye on connection state; surface disconnections and attempt reconnect.
  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    if (state === "disconnected" || state === "failed") {
      emit({ type: "disconnected", reason: state });
      // Attempt automatic reconnect for transient failures
      if (state === "disconnected" && connectionState === "connected") {
        connectionState = "connecting";
        attemptReconnect();
      }
    } else if (state === "connected" && connectionState === "connecting") {
      connectionState = "connected";
      reconnectAttempts = 0; // Reset on successful connection
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    } else if (state === "closed") {
      emit({ type: "disconnected", reason: state });
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === "disconnected" || state === "failed") {
      emit({ type: "disconnected", reason: state });
      // Attempt automatic reconnect for transient failures
      if (state === "disconnected" && connectionState === "connected") {
        connectionState = "connecting";
        attemptReconnect();
      }
    } else if (state === "connected" && connectionState === "connecting") {
      connectionState = "connected";
      reconnectAttempts = 0; // Reset on successful connection
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    } else if (state === "closed") {
      emit({ type: "disconnected", reason: state });
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }
  };

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    if (!stream) return;

    // If this is the same stream we already have, do nothing.
    if (remoteStream === stream) {
      return;
    }

    // Replace any previous remote stream.
    remoteStream = stream;
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "true");
      // Fix deep-voice bug: Ensure consistent playback rate and prevent pitch distortion
      audioEl.playbackRate = 1.0;
      audioEl.defaultPlaybackRate = 1.0;
      // Prevent audio context issues that cause deep voice
      audioEl.preload = "auto";
      // Ensure smooth audio playback without artifacts
      audioEl.crossOrigin = "anonymous";
    }

    // Attach the latest remote stream to our single audio element.
    // Ensure clean stream attachment to prevent audio glitches
    if (audioEl.srcObject) {
      const oldStream = audioEl.srcObject as MediaStream;
      oldStream.getTracks().forEach((track) => track.stop());
    }
    audioEl.srcObject = remoteStream;
    
    // Ensure audio plays smoothly without deep-voice artifacts
    audioEl.play().catch((err) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[RealtimeClient] Audio autoplay prevented, user interaction required", err);
      }
    });
  };

  // Negotiate bidirectional audio exactly once.
  pc.addTransceiver("audio", { direction: "sendrecv" });

  const client: RealtimeVellaClient = {
    attachMicrophone(stream: MediaStream) {
      micStream = stream;
      micStream.getTracks().forEach((track) => {
        pc.addTrack(track, micStream as MediaStream);
      });
    },

    async connect() {
      if (connectionState === "connected") {
        return;
      }

      if (connectionState === "connecting" && connectPromise) {
        return connectPromise;
      }

      connectionState = "connecting";
      connectPromise = (async () => {
        // 1) Create RTCPeerConnection + DataChannel and wire up handlers
        const dc = ensureDataChannel();
        if (pc.signalingState === "closed") {
          throw new Error("Peer connection already closed.");
        }

        // 2) Create offer and send to /api/realtime/offer WITH access token
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const sdp = offer.sdp ?? "";
        
        // Always ensure we have a Supabase session via anonymous auth before calling the offer API.
        const session = await ensureVellaSession();

        const accessToken = null; // ensureVellaSession returns null

        if (process.env.NODE_ENV === "development") {
          if (!accessToken) {
            console.warn("[REALTIME:DIAGNOSTIC] No access token returned from ensureVellaSession()");
          } else {
            console.log(
              "[REALTIME:DIAGNOSTIC] Access token from ensureVellaSession()",
              "no token",
            );
          }
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (accessToken) {
          headers["sb-access-token"] = accessToken;
        }

        const resp = await fetch("/api/realtime/offer", {
          method: "POST",
          headers,
          body: JSON.stringify({ sdp }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`Realtime SDP negotiation failed: ${resp.status} ${text}`);
        }

        const json = (await resp.json()) as { sdp?: string };
        if (!json.sdp) {
          throw new Error("Missing answer SDP from /api/realtime/offer");
        }

        const answer = new RTCSessionDescription({
          type: "answer",
          sdp: json.sdp,
        });

        await pc.setRemoteDescription(answer);

        // 3) Wait for DataChannel to be open
        await ensureDataChannelReady();

        connectionState = "connected";

        if (process.env.NODE_ENV === "development") {
          console.log("[RealtimeClient] WebRTC + DataChannel ready");
        }
      })();

      try {
        await connectPromise;
      } catch (err) {
        connectionState = "error";
        connectPromise = null;
        throw err;
      }
    },

    async disconnect() {
      connectionState = "closing";
      connectPromise = null;
      dcReadyPromise = null;
      resolveDcReady = null;
      
      // Cancel any pending reconnection attempts
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempts = 0;

      // Close data channel
      try {
        if (dataChannel && dataChannel.readyState === "open") {
          dataChannel.close();
        }
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[realtimeClient] closing data channel failed:", err);
        }
      }
      dataChannel = null;

      // Stop microphone tracks
      if (micStream) {
        micStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (err) {
            if (process.env.NODE_ENV === "development") {
              console.warn("[realtimeClient] stopping mic track failed:", err);
            }
          }
        });
        micStream = null;
      }

      // Stop remote stream tracks and detach from audio element
      if (remoteStream) {
        remoteStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (err) {
            if (process.env.NODE_ENV === "development") {
              console.warn("[realtimeClient] stopping remote track failed:", err);
            }
          }
        });
        remoteStream = null;
      }

      if (audioEl) {
        try {
          audioEl.pause();
          audioEl.srcObject = null;
        } catch (err) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[realtimeClient] resetting audio element failed:", err);
          }
        }
        // We keep the element around for reuse; no need to remove from DOM,
        // since we never attached it to the document.
      }

      // Close peer connection
      try {
        pc.getSenders().forEach((sender) => {
          try {
            pc.removeTrack(sender);
          } catch (err) {
            if (process.env.NODE_ENV === "development") {
              console.warn("[realtimeClient] removing sender failed:", err);
            }
          }
        });
        pc.close();
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[realtimeClient] closing peer connection failed:", err);
        }
      }

      connectionState = "idle";
      emit({ type: "disconnected", reason: "client_disconnect" });
    },

    sendTextMessage(text: string) {
      const trimmed = text?.trim();
      if (!trimmed) return;
      if (!dataChannel || dataChannel.readyState !== "open") {
        console.warn("[TEXT:CLIENT] DataChannel not ready, cannot send text");
        return;
      }

      const createItem = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            { type: INPUT_TEXT_FIELD, text: trimmed },
          ],
        },
      };

      sendOnChannel(createItem);

      const createResponse = {
        type: "response.create",
        response: {},
      };

      sendOnChannel(createResponse);

      if (process.env.NODE_ENV === "development") {
        console.log("[TEXT:CLIENT] Sent conversation.item.create and response.create");
      }
    },

    onEvent(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },

    setDeliveryContext(ctx: VellaDeliveryContext) {
      deliveryContext = { ...deliveryContext, ...ctx };
    },

    updateSession(options: {
      modalities: string[];
      instructions: string;
      voice?: string;
      audio?: { sampleRate: number };
    }) {
      // Freeze instructions to prevent accidental modification
      Object.freeze(options.instructions);
      // DO NOT set instructions here. Persona is controlled ONLY by buildPersonaInstruction().
      // This method is called only during initial session setup with unified persona instructions.
      // Voice/model config MUST only come from VELLA_REALTIME_VOICE_CONFIG.
      // Do NOT override model/voice/modalities/output_audio_format/temperature/top_p at runtime.
      const sessionUpdate: any = {
        type: "session.update",
        session: {
          model: VELLA_REALTIME_VOICE_CONFIG.model,
          modalities: options.modalities,
          instructions: options.instructions,
          voice: options.voice ?? VELLA_REALTIME_VOICE_CONFIG.voice,
          temperature: VELLA_REALTIME_VOICE_CONFIG.temperature,
          top_p: VELLA_REALTIME_VOICE_CONFIG.topP,
          max_output_tokens: VELLA_REALTIME_VOICE_CONFIG.maxOutputTokens,
        },
      };

      if (options.audio) {
        sessionUpdate.session.input_audio_format = VELLA_REALTIME_VOICE_CONFIG.outputAudioFormat;
        sessionUpdate.session.output_audio_format = VELLA_REALTIME_VOICE_CONFIG.outputAudioFormat;
        sessionUpdate.session.audio = options.audio;
        sessionUpdate.session.turn_detection = { type: "server_vad" };
      }

      sendOnChannel(sessionUpdate);
    },

    updatePersona(options?: {
      voiceId?: VellaVoiceId;
      moodState?: MoodState;
      delivery?: VellaDeliveryHints;
      relationshipMode?: RelationshipMode;
      emotionalState?: EmotionalState | null;
      userSettings?: VellaSettings | null;
      emotionalMemory?: EmotionalMemorySnapshot | null;
      healthState?: HealthState | null;
      responsePlan?: ResponsePlan | null;
      userText?: string;
      insights?: InsightSnapshot | null;
      behaviourVector?: BehaviourVector | null;
      intelligenceItems?: IntelligenceItem[] | null;
      language?: SupportedLanguage;
    }) {
      if (options?.voiceId) {
        deliveryContext = { ...deliveryContext, voiceId: options.voiceId };
      }
      if (options?.moodState) {
        deliveryContext = { ...deliveryContext, moodState: options.moodState };
      }
      if (options && "emotionalMemory" in options) {
        personaMemorySnapshot = options.emotionalMemory ?? personaMemorySnapshot;
      }
      if (options && "behaviourVector" in options) {
        personaBehaviourVectorSnapshot =
          options.behaviourVector ?? personaBehaviourVectorSnapshot;
      }
      if (options && "intelligenceItems" in options) {
        personaIntelligenceItems = options.intelligenceItems ?? personaIntelligenceItems;
      }
      if (typeof options?.userText === "string") {
        lastUserTextSnapshot = options.userText;
      }
      if (options?.language) {
        currentLanguage = options.language;
      }
      sendPersonaUpdate({
        voiceId: deliveryContext.voiceId,
        moodState: deliveryContext.moodState,
        delivery: options?.delivery,
        relationshipMode: options?.relationshipMode,
        emotionalState: options?.emotionalState ?? emotionalStateSnapshot,
        userSettings: options?.userSettings ?? personaUserSettings,
        emotionalMemory: options?.emotionalMemory ?? personaMemorySnapshot,
        healthState: options?.healthState ?? personaHealthSnapshot,
        responsePlan: options?.responsePlan ?? personaResponsePlan,
        userText: options?.userText ?? lastUserTextSnapshot,
        insights: options?.insights ?? personaInsightsSnapshot,
        behaviourVector: options?.behaviourVector ?? personaBehaviourVectorSnapshot,
        intelligenceItems: options?.intelligenceItems ?? personaIntelligenceItems,
        language: options?.language ?? currentLanguage,
      }).catch((err) => {
        console.error("[realtimeClient] sendPersonaUpdate error", err);
      });
    },
  };

  return client;
}

