"use client";

import type { EmotionIntelBundle } from "@/lib/ai/types";
import type { SupportedLanguageCode } from "@/lib/ai/languages";
import {
  DEFAULT_MEMORY_PROFILE,
  type MemoryProfile,
  MEMORY_PROFILE_VERSION,
  buildSnapshotFromIntel,
  mergeIdentityFromIntel,
  type DailyCheckIn,
} from "./types";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import type { DataMetadata } from "@/lib/lifecycle/metadata";
import {
  addCheckin,
  listCheckins,
  type CheckinInput,
  type Checkin,
} from "@/lib/checkins/clientCheckins";
import { supabase } from "@/lib/supabase/client";
import { resolvePlanTier } from "@/lib/tiers/planUtils";
import { DEFAULT_VELLA_VOICE_ID } from "@/lib/voice/vellaVoices";
import {
  purgeBehaviourVector,
  purgeEmotionalHistory,
  purgeMessages,
  purgeInsights,
  purgeAuditLogs,
} from "@/lib/lifecycle/purgeEngine";
import { RETENTION_POLICY_VERSION } from "@/lib/lifecycle/policy";
import type { Database } from "@/lib/supabase/types";

const STORAGE_KEY = "vella_memory_v1";
type SubscriptionPlanRow = Pick<Database["public"]["Tables"]["subscriptions"]["Row"], "plan">;

type StoredMemoryProfile = Partial<MemoryProfile> & {
  styleBias?: Partial<Record<"warm" | "direct" | "stoic" | "soft" | "calm", number>>;
};

export function loadLocalMemory(): MemoryProfile {
  if (typeof window === "undefined") return DEFAULT_MEMORY_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MEMORY_PROFILE;
    const parsed = JSON.parse(raw) as StoredMemoryProfile;
    const normalized = normalizeStoredProfile(parsed);
    saveLocalMemory(normalized);
    return normalized;
  } catch (err) {
    // silent fallback
    try {
      window.dispatchEvent(
        new CustomEvent("vella-memory-error", {
          detail: { type: "load", error: String(err) },
        }),
      );
    } catch {
      // ignore event dispatch errors
    }
    return DEFAULT_MEMORY_PROFILE;
  }
}

export function saveLocalMemory(profile: MemoryProfile) {
  if (typeof window === "undefined") return;
  try {
    const normalized = ensureSchemaVersion(profile);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    // silent fallback
    try {
      window.dispatchEvent(
        new CustomEvent("vella-memory-error", {
          detail: { type: "save", error: String(err) },
        }),
      );
    } catch {
      // ignore
    }
  }
}

export function recordEmotionalIntel(
  profile: MemoryProfile,
  intel: EmotionIntelBundle,
  userText: string,
): MemoryProfile {
  const snapshot = buildSnapshotFromIntel(userText, intel);
  const updatedHistory = [snapshot, ...profile.emotionalHistory].slice(0, 100);
  const updatedIdentity = mergeIdentityFromIntel(profile.identity, intel);

  return {
    ...profile,
    emotionalHistory: updatedHistory,
    identity: updatedIdentity,
  };
}

export function updateTonePreference(
  profile: MemoryProfile,
  tone: MemoryProfile["tonePreference"],
): MemoryProfile {
  return { ...profile, tonePreference: tone };
}

export function updateDepthMode(
  profile: MemoryProfile,
  mode: MemoryProfile["depthMode"],
): MemoryProfile {
  return { ...profile, depthMode: mode };
}

export function updateUserName(profile: MemoryProfile, name: string): MemoryProfile {
  const cleaned = name.trim();
  if (!cleaned) return profile;
  return {
    ...profile,
    userName: cleaned,
    preferredName: cleaned,
  };
}

export function deriveConversationPatterns(profile: MemoryProfile): MemoryProfile {
  const snapshots = profile.emotionalHistory;
  if (snapshots.length < 2) return profile;

  const primary = new Map<string, number>();
  const triggers = new Map<string, number>();
  const fears = new Map<string, number>();

  for (const snapshot of snapshots) {
    primary.set(snapshot.primaryEmotion, (primary.get(snapshot.primaryEmotion) ?? 0) + 1);
    for (const trig of snapshot.triggers) {
      triggers.set(trig, (triggers.get(trig) ?? 0) + 1);
    }
    for (const fear of snapshot.underlyingFears) {
      fears.set(fear, (fears.get(fear) ?? 0) + 1);
    }
  }

  const sorted = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key)
      .slice(0, 5);

  return {
    ...profile,
    emotionalPatterns: {
      commonPrimaryEmotions: sorted(primary),
      commonTriggers: sorted(triggers),
      commonFears: sorted(fears),
      emotionalTendencies: [],
    },
  };
}

export async function deriveEmotionalPatternsServerSide(): Promise<never> {
  throw new Error("deriveEmotionalPatterns must be called via server route");
}

export async function recordDailyCheckIn(entry: CheckinInput): Promise<DailyCheckIn> {
  const inserted = await addCheckin(entry);
  return mapCheckinToDaily(inserted);
}

export async function getRecentCheckIns(limit = 5): Promise<DailyCheckIn[]> {
  const rows = await listCheckins({ limit });
  return rows.map(mapCheckinToDaily);
}

export function mapCheckinToDaily(row: Checkin): DailyCheckIn {
  const createdAt = row.created_at ?? new Date().toISOString();
  const date = row.entry_date ?? createdAt.slice(0, 10);
  return {
    id: row.id,
    createdAt,
    date,
    mood: row.mood ?? 0,
    energy: row.energy ?? 0,
    stress: row.stress ?? 0,
    focus: row.focus ?? 0,
    note: row.note ?? "",
  };
}

export function updateStyleBiasFromTone(
  profile: MemoryProfile,
  tone: MemoryProfile["tonePreference"],
): MemoryProfile {
  const bias = { ...profile.styleBias };
  if (tone === "soft") bias.soft += 0.2;
  if (tone === "warm") bias.warm += 0.2;
  if (tone === "direct") bias.direct += 0.2;
  if (tone === "stoic") bias.stoic += 0.2;

  const max = Math.max(bias.soft, bias.warm, bias.direct, bias.stoic, 1);
  const min = Math.min(bias.soft, bias.warm, bias.direct, bias.stoic);
  const span = max - min || 1;

  const normalised = {
    soft: 1 + (bias.soft - min) / span,
    warm: 1 + (bias.warm - min) / span,
    direct: 1 + (bias.direct - min) / span,
    stoic: 1 + (bias.stoic - min) / span,
  };

  return {
    ...profile,
    styleBias: normalised,
  };
}

export function appendEvolutionNote(profile: MemoryProfile, note: string): MemoryProfile {
  const trimmed = note.trim();
  if (!trimmed) return profile;
  const notes = [trimmed, ...profile.evolutionNotes].slice(0, 20);
  return { ...profile, evolutionNotes: notes };
}

export async function updatePlan(plan: MemoryProfile["plan"], opts?: { refresh?: boolean }): Promise<MemoryProfile> {
  let profile = loadLocalMemory();
  profile = { ...profile, plan };
  saveLocalMemory(profile);

  if (opts?.refresh === false) {
    return profile;
  }

  const refreshed = await refreshPlanFromSupabase().catch(() => null);
  return refreshed ?? profile;
}

export async function refreshPlanFromSupabase(): Promise<MemoryProfile | null> {
  // Local-first: no Supabase auth, return current local profile
  const profile = loadLocalMemory();
  return profile;
}

export function incrementMonthlyMessages(profile: MemoryProfile): MemoryProfile {
  return { ...profile, monthlyMessages: (profile.monthlyMessages ?? 0) + 1 };
}

export function updatePreferredLanguage(
  profile: MemoryProfile,
  lang: SupportedLanguageCode,
): MemoryProfile {
  return {
    ...profile,
    preferredLanguage: lang,
  };
}

export function updateVoiceModel(
  profile: MemoryProfile,
  model: MemoryProfile["voiceModel"],
): MemoryProfile {
  return { ...profile, voiceModel: model ?? DEFAULT_VELLA_VOICE_ID };
}

export function updateEmotionalStyle(
  profile: MemoryProfile,
  style: MemoryProfile["emotionalStyle"],
): MemoryProfile {
  return { ...profile, emotionalStyle: style ?? profile.tonePreference };
}

function normalizeStoredProfile(parsed: StoredMemoryProfile): MemoryProfile {
  const base: MemoryProfile = {
    ...DEFAULT_MEMORY_PROFILE,
    ...parsed,
    tonePreference:
      (parsed.tonePreference as MemoryProfile["tonePreference"] | undefined) ??
      DEFAULT_MEMORY_PROFILE.tonePreference,
  };

  base.emotionalHistory = purgeEmotionalHistory(parsed.emotionalHistory ?? []);
  base.insights = purgeInsights(parsed.insights ?? null);
  base.behaviourVector = purgeBehaviourVector(parsed.behaviourVector ?? null);
  base.messages = purgeMessages(parsed.messages ?? []);
  base.auditLogs = purgeAuditLogs(parsed.auditLogs ?? []);
  base.identity = {
    ...DEFAULT_MEMORY_PROFILE.identity,
    ...(parsed.identity ?? {}),
  };
  base.metadata = normalizeMetadata(parsed.metadata);
  base.preferredLanguage = parsed.preferredLanguage ?? DEFAULT_MEMORY_PROFILE.preferredLanguage;
  base.voiceHud = parsed.voiceHud ?? DEFAULT_MEMORY_PROFILE.voiceHud;
  base.voiceMode = parsed.voiceMode ?? DEFAULT_MEMORY_PROFILE.voiceMode;
  base.voiceModel = parsed.voiceModel ?? DEFAULT_MEMORY_PROFILE.voiceModel;
  if (!base.emotionalStyle) {
    base.emotionalStyle = base.tonePreference;
  }

  const needsMigration = (parsed.version ?? 0) < MEMORY_PROFILE_VERSION;
  if (needsMigration) {
    base.tonePreference = normalizeTonePreference(parsed.tonePreference, base.tonePreference);
    base.emotionalStyle = base.emotionalStyle ?? base.tonePreference;
  }

  const incomingBias = parsed.styleBias ?? base.styleBias;
  base.styleBias = normalizeStyleBias(incomingBias);

  return ensureSchemaVersion(base);
}

function signalMetadataCorruption(field: "lastPurge" | "lastPolicyUpdate", value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("vella-memory-error", {
        detail: { type: "metadata", field, value },
      }),
    );
  } catch {
    // ignore event dispatch errors
  }
}

function normalizeMetadata(metadata?: DataMetadata | null): DataMetadata {
  const now = Date.now();
  const incoming: Partial<DataMetadata> = metadata ?? {};

  let lastPurge = incoming.lastPurge;
  if (typeof lastPurge !== "number" || !Number.isFinite(lastPurge)) {
    signalMetadataCorruption("lastPurge", lastPurge);
    // silent fallback
    lastPurge = now;
  }

  const validPolicyVersions = new Set([RETENTION_POLICY_VERSION]);
  let lastPolicyUpdate = incoming.lastPolicyUpdate;
  if (typeof lastPolicyUpdate !== "string" || !validPolicyVersions.has(lastPolicyUpdate)) {
    signalMetadataCorruption("lastPolicyUpdate", lastPolicyUpdate);
    // silent fallback
    lastPolicyUpdate = RETENTION_POLICY_VERSION;
  }

  return {
    ...incoming,
    lastPurge,
    lastPolicyUpdate,
  };
}

export function updateBehaviourVectorLocal(vector: BehaviourVector | null) {
  if (typeof window === "undefined") return;
  const profile = loadLocalMemory();
  const prev = profile.behaviourVector;
  if (prev && vector && behaviourVectorsEqual(prev, vector)) {
    return;
  }
  const next: MemoryProfile = {
    ...profile,
    behaviourVector: vector,
  };
  saveLocalMemory(next);
}

function behaviourVectorsEqual(a: BehaviourVector, b: BehaviourVector, epsilon = 0.001) {
  return (
    Math.abs(a.warmthBias - b.warmthBias) < epsilon &&
    Math.abs(a.directnessBias - b.directnessBias) < epsilon &&
    Math.abs(a.brevityBias - b.brevityBias) < epsilon &&
    Math.abs(a.curiosityBias - b.curiosityBias) < epsilon
  );
}

function normalizeStyleBias(
  bias?: Partial<Record<"warm" | "direct" | "stoic" | "soft" | "calm", number>> | MemoryProfile["styleBias"],
): MemoryProfile["styleBias"] {
  const fallback = DEFAULT_MEMORY_PROFILE.styleBias;
  const source = bias ?? fallback;
  const coerce = (value: unknown, fallbackValue: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallbackValue;

  const softCandidate =
    (source as Partial<Record<"soft" | "calm", number>>).soft ??
    (source as Partial<Record<"soft" | "calm", number>>).calm;

  return {
    warm: coerce((source as Partial<Record<"warm", number>>).warm, fallback.warm),
    direct: coerce((source as Partial<Record<"direct", number>>).direct, fallback.direct),
    stoic: coerce((source as Partial<Record<"stoic", number>>).stoic, fallback.stoic),
    soft: coerce(softCandidate, fallback.soft),
  };
}

function normalizeTonePreference(
  tone: MemoryProfile["tonePreference"] | "calm" | "compassionate" | undefined,
  fallback: MemoryProfile["tonePreference"],
): MemoryProfile["tonePreference"] {
  if (tone === "calm") return "soft";
  if (tone === "compassionate") return "warm";
  if (tone === "soft" || tone === "warm" || tone === "direct" || tone === "stoic") {
    return tone;
  }
  return fallback;
}

function ensureSchemaVersion(profile: MemoryProfile): MemoryProfile {
  if (profile.version === MEMORY_PROFILE_VERSION) {
    return profile;
  }
  return { ...profile, version: MEMORY_PROFILE_VERSION };
}

