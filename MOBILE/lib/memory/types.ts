import type { EmotionIntelBundle } from "@/lib/ai/types";
import type { SupportedLanguageCode } from "@/lib/ai/languages";
import { DEFAULT_VELLA_VOICE_ID, type VellaVoiceId } from "@/lib/voice/vellaVoices";
import type { InsightSnapshot, BehaviourPattern } from "@/lib/insights/types";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import type { DataMetadata } from "@/lib/lifecycle/metadata";
import { RETENTION_POLICY_VERSION } from "@/lib/lifecycle/policy";
import type { RelationshipMode } from "@/lib/realtime/emotion/state";

export const MEMORY_PROFILE_VERSION = 2;

export type TonePreference = "soft" | "warm" | "direct" | "stoic";
export type DepthMode = "light" | "balanced" | "deep" | "reflective";
export type VoiceModel = VellaVoiceId;
export type QuestionFrequency = "low" | "medium" | "high";
export type VariabilityLevel = "low" | "medium" | "high";
export type SarcasmSoftness = "off" | "gentle" | "playful";

export type EmotionalSnapshot = {
  id: string;
  createdAt: string;
  text: string;
  primaryEmotion: string;
  secondaryEmotions: string[];
  triggers: string[];
  underlyingFears: string[];
  intensityGuess: number;
};

export interface EmotionalMemorySnapshot {
  avgValence: number;
  avgWarmth: number;
  avgCuriosity: number;
  avgTension: number;
  lastUpdated: number;
}

export type IdentityMemory = {
  coreValues: string[];
  recurringDilemmas: string[];
  selfStories: string[];
  strengths: string[];
  blindSpots: string[];
  growthEdges: string[];
  attachmentTendencies: string[];
  lastUpdated: string | null;
};

export type DailyCheckIn = {
  id: string;
  date: string;
  createdAt: string;
  mood: number;
  energy: number;
  stress: number;
  focus: number;
  note: string;
};

export type StoredMessage = {
  id?: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

export type AuditLogEntry = {
  id?: string;
  type: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

export type VoiceHudSettings = {
  moodChip: boolean;
  stability: boolean;
  deliveryHints: boolean;
  sessionTime: boolean;
  tokenChip: boolean;
  strategyChip?: boolean;
  alertChip?: boolean;
};

export type MemoryInsightsSnapshot = {
  items: BehaviourPattern[];
  patterns?: BehaviourPattern[];
  insights?: BehaviourPattern[];
  mode?: "ai" | "lite";
  fallback?: boolean;
  lastComputed: number;
};

export type MemoryProfile = {
  version?: number;
  userId?: string | null;
  tonePreference: TonePreference;
  emotionalStyle?: TonePreference;
  depthMode: DepthMode;
  userName: string | null;
  preferredName: string | null;
  preferredLanguage: SupportedLanguageCode;
  voiceModel?: VoiceModel;
  onboardingFeeling: string | null;
  onboardingReason: string | null;
  onboardingFocus: string | null;
  onboardingRelationshipMode: string | null;
  onboardingComplete: boolean;
  plan: "free" | "pro" | "elite";
  emotionalHistory: EmotionalSnapshot[];
  identity: IdentityMemory;
  emotionalPatterns: {
    commonPrimaryEmotions: string[];
    commonTriggers: string[];
    commonFears: string[];
    emotionalTendencies: string[];
  };
  dailyCheckIns: DailyCheckIn[];
  monthlyMessages: number;
  styleBias: {
    warm: number;
    direct: number;
    stoic: number;
    soft: number;
  };
  evolutionNotes: string[];
  emotionalMemory?: EmotionalMemorySnapshot | null;
  insights?: MemoryInsightsSnapshot | InsightSnapshot | null;
  behaviourVector?: BehaviourVector | null;
  metadata?: DataMetadata | null;
  messages?: StoredMessage[];
  auditLogs?: AuditLogEntry[];
  voiceHud?: VoiceHudSettings;
  voiceMode?: "text" | "voice";
  relationshipMode?: RelationshipMode | null;
};

export const DEFAULT_MEMORY_PROFILE: MemoryProfile = {
  version: MEMORY_PROFILE_VERSION,
  userId: null,
  tonePreference: "soft",
  emotionalStyle: "soft",
  depthMode: "balanced",
  userName: null,
  preferredName: null,
  preferredLanguage: "en",
  voiceModel: DEFAULT_VELLA_VOICE_ID,
  onboardingFeeling: null,
  onboardingReason: null,
  onboardingFocus: null,
  onboardingRelationshipMode: null,
  onboardingComplete: false,
  plan: "free",
  emotionalHistory: [],
  identity: {
    coreValues: [],
    recurringDilemmas: [],
    selfStories: [],
    strengths: [],
    blindSpots: [],
    growthEdges: [],
    attachmentTendencies: [],
    lastUpdated: null,
  },
  emotionalPatterns: {
    commonPrimaryEmotions: [],
    commonTriggers: [],
    commonFears: [],
    emotionalTendencies: [],
  },
  dailyCheckIns: [],
  monthlyMessages: 0,
  styleBias: {
    warm: 1,
    direct: 1,
    stoic: 1,
    soft: 1,
  },
  evolutionNotes: [],
  emotionalMemory: null,
  insights: null,
  behaviourVector: null,
  metadata: {
    lastPurge: Date.now(),
    lastPolicyUpdate: RETENTION_POLICY_VERSION,
  },
  messages: [],
  auditLogs: [],
  voiceHud: {
    moodChip: true,
    stability: true,
    deliveryHints: true,
    sessionTime: true,
    tokenChip: true,
    strategyChip: true,
    alertChip: true,
  },
  voiceMode: "text",
  relationshipMode: "best_friend",
};

let snapshotCounter = 0;
const nextSnapshotId = () => {
  snapshotCounter = (snapshotCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `snapshot-${Date.now()}-${snapshotCounter.toString(16)}`;
};

export function buildSnapshotFromIntel(
  text: string,
  intel: EmotionIntelBundle,
): EmotionalSnapshot {
  const primary = intel.emotion.primaryEmotion || "mixed";
  const secondary = intel.emotion.secondaryEmotions ?? [];
  const triggers = intel.emotion.triggers ?? [];
  const fears = intel.emotion.underlyingFears ?? [];
  const planCount = intel.emotion.shortTermPlan?.length ?? 0;
  const base = 5;
  const signalCount = secondary.length + triggers.length + fears.length + planCount;
  const intensity = Math.max(1, Math.min(10, base + Math.floor(signalCount / 2)));

  return {
    id: nextSnapshotId(),
    createdAt: new Date().toISOString(),
    text,
    primaryEmotion: primary,
    secondaryEmotions: secondary,
    triggers,
    underlyingFears: fears,
    intensityGuess: intensity,
  };
}

export function mergeIdentityFromIntel(
  prev: IdentityMemory,
  intel: EmotionIntelBundle,
): IdentityMemory {
  const src = intel.identity;

  function mergeLists(current: string[], incoming: string[] = []) {
    const combined = [...current];
    for (const item of incoming) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      if (!combined.includes(trimmed)) combined.push(trimmed);
    }
    return combined.slice(0, 20);
  }

  return {
    coreValues: mergeLists(prev.coreValues, src.coreValues ?? []),
    recurringDilemmas: mergeLists(prev.recurringDilemmas, src.recurringDilemmas ?? []),
    selfStories: mergeLists(prev.selfStories, src.selfStories ?? []),
    strengths: mergeLists(prev.strengths, src.strengths ?? []),
    blindSpots: mergeLists(prev.blindSpots, src.blindSpots ?? []),
    growthEdges: mergeLists(prev.growthEdges, src.growthEdges ?? []),
    attachmentTendencies: mergeLists(prev.attachmentTendencies, src.attachmentTendencies ?? []),
    lastUpdated: new Date().toISOString(),
  };
}

