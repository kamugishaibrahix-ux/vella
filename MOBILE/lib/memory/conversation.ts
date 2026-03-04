// PRIVACY MODE:
// All sensitive conversation data is stored locally on the device,
// never in Supabase. This module now delegates to local storage helpers.

import type { EmotionalState } from "@/lib/realtime/emotion/state";
import type { BehaviourVector } from "@/lib/adaptive/behaviourVector";
import type { SupportedLanguageCode } from "@/lib/ai/languages";
import { generatePersonaInsights } from "@/lib/insights/generatePersonaInsights";
import { loadServerPersonaSettings } from "@/lib/ai/personaServer";
import {
  saveLocalMessage,
  getLocalRecentMessages,
  getLocalFullHistory,
  saveLocalSummary,
  loadLocalSummary,
  saveLocalMemoryProfile,
  loadLocalMemoryProfile,
  type LocalConversationMessage,
} from "@/lib/local/conversationLocal";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string | null;
};

export type EmotionalMemorySample = {
  valence: number;
  warmth: number;
  curiosity: number;
  tension: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function isDialogueRole(role: LocalConversationMessage["role"]): role is ConversationMessage["role"] {
  return role === "user" || role === "assistant";
}

function isDialogueMessage(
  message: LocalConversationMessage,
): message is LocalConversationMessage & { role: ConversationMessage["role"] } {
  return isDialogueRole(message.role);
}

export async function saveMessage(
  userId: string | undefined,
  role: "user" | "assistant",
  content: string,
) {
  try {
    saveLocalMessage(userId, {
      id: crypto.randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    // silent fallback
  }
}

export async function getRecentMessages(userId: string | undefined, limit = 10): Promise<ConversationMessage[]> {
  try {
    // Load admin tuning to adjust context window and selectivity
    let effectiveLimit = limit;
    let selectivity = 50; // Default 50% selectivity
    try {
      const { loadRuntimeTuning } = await import("@/lib/admin/runtimeTuning");
      const tuning = await loadRuntimeTuning();
      const memory = (tuning as { memory?: { maxContextTurns?: number; selectivity?: number } }).memory;
      effectiveLimit = Math.max(limit, Math.min(memory?.maxContextTurns ?? 50, 50));
      selectivity = memory?.selectivity ?? 50;
    } catch {
      // Fall back to requested limit if admin tuning unavailable
    }
    
    const localMessages = getLocalRecentMessages(userId, effectiveLimit).filter(isDialogueMessage);
    
    // Apply selectivity: higher selectivity = keep fewer but more recent messages
    // Lower selectivity = allow slightly deeper history within the limit
    if (selectivity > 50 && localMessages.length > 0) {
      // Higher selectivity: trim more aggressively, keep only most recent
      const selectivityFactor = selectivity / 100; // 0.5-1.0
      const keepCount = Math.max(1, Math.floor(localMessages.length * selectivityFactor));
      return localMessages.slice(-keepCount).map((msg) => ({
        role: msg.role,
        content: msg.content,
        created_at: msg.createdAt,
      }));
    }
    
    // TODO: admin toggle ragRecallStrength not wired yet (no RAG/retrieval system currently integrated)
    // When RAG is implemented, use ragRecallStrength to scale:
    // - Number of retrieved items (higher strength = more items)
    // - Minimum similarity threshold (higher strength = lower threshold, more aggressive retrieval)
    // - Embedding model selection is ready via getEmbeddingModel() in lib/ai/embeddings.ts
    
    return localMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      created_at: msg.createdAt,
    }));
  } catch (error) {
    // silent fallback
    return [];
  }
}

export async function getFullHistory(userId: string | undefined, limit = 50): Promise<ConversationMessage[]> {
  try {
    const localMessages = getLocalFullHistory(userId).filter(isDialogueMessage);
    // Apply limit if needed
    const limited = limit > 0 ? localMessages.slice(-limit) : localMessages;
    return limited.map((msg) => ({
      role: msg.role,
      content: msg.content,
      created_at: msg.createdAt,
    }));
  } catch (error) {
    // silent fallback
    return [];
  }
}

export async function saveSummary(userId: string | undefined, summary: string) {
  try {
    saveLocalSummary(userId, summary);
  } catch (error) {
    // silent fallback
  }
}

export async function getSummary(userId: string | undefined): Promise<string | null> {
  try {
    const summary = loadLocalSummary(userId);
    return summary?.summary ?? null;
  } catch (error) {
    // silent fallback
    return null;
  }
}

// normalizeRow removed - no longer needed with local storage

export async function saveEmotionalMemorySnapshot(
  userId: string | undefined,
  samples: EmotionalMemorySample[],
) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return;
  }

  const existingProfile = loadLocalMemoryProfile(userId);
  const personaHints = await loadPersonaHints(userId, existingProfile);

  const totals = samples.reduce(
    (acc, sample) => {
      acc.valence += clamp(sample.valence, -1, 1);
      acc.warmth += clamp(sample.warmth, 0, 1);
      acc.curiosity += clamp(sample.curiosity, 0, 1);
      acc.tension += clamp(sample.tension, 0, 1);
      return acc;
    },
    { valence: 0, warmth: 0, curiosity: 0, tension: 0 },
  );

  const divisor = samples.length;
  const averages = {
    avgValence: totals.valence / divisor,
    avgWarmth: totals.warmth / divisor,
    avgCuriosity: totals.curiosity / divisor,
    avgTension: totals.tension / divisor,
    lastUpdated: Date.now(),
  };

  try {
    saveLocalMemoryProfile(userId, {
      emotionalMemory: averages,
      behaviourVector: personaHints.behaviourVector ?? existingProfile?.behaviourVector ?? null,
    });
  } catch (error) {
    // silent fallback
  }
}

export async function recomputeInsightsSnapshot(
  userId: string | undefined,
  emotionalHistory: EmotionalState[],
) {
  const existingProfile = loadLocalMemoryProfile(userId);
  const [recent, personaSettings, personaHints] = await Promise.all([
    getRecentMessages(userId, 20),
    loadServerPersonaSettings(userId ?? null),
    loadPersonaHints(userId, existingProfile),
  ]);

  const formatted = recent
    .slice(-20)
    .reverse()
    .map((msg) => ({ role: msg.role, text: msg.content }));

  const latestEmotion = emotionalHistory.length
    ? emotionalHistory[emotionalHistory.length - 1] ?? null
    : null;

  const snapshot = await generatePersonaInsights({
    userId,
    messages: formatted,
    emotionalState: latestEmotion,
    emotionalHistory,
    behaviourVector: personaHints.behaviourVector,
    persona: {
      voiceModel: personaSettings?.voiceModel,
      toneStyle: personaSettings?.toneStyle ?? personaSettings?.tone,
      relationshipMode: personaSettings?.relationshipMode,
      language: personaHints.language ?? null,
    },
  });

  try {
    saveLocalMemoryProfile(userId, {
      insights: snapshot,
      behaviourVector: personaHints.behaviourVector ?? existingProfile?.behaviourVector ?? null,
    });
  } catch (error) {
    // silent fallback
  }
}

async function loadPersonaHints(
  userId: string | undefined,
  cachedProfile?: ReturnType<typeof loadLocalMemoryProfile> | null,
): Promise<{
  language?: SupportedLanguageCode;
  behaviourVector: BehaviourVector | null;
}> {
  try {
    const profile = cachedProfile ?? loadLocalMemoryProfile(userId);

    return {
      // Note: preferred_language is not stored in local memory profile
      // It should come from profiles table (non-sensitive)
      language: undefined,
      behaviourVector: (profile?.behaviourVector as BehaviourVector | null) ?? null,
    };
  } catch (err) {
    // silent fallback
    return { behaviourVector: null };
  }
}

export async function persistBehaviourVector(
  userId: string | undefined,
  vector: BehaviourVector | null,
  _opts?: { preferredLanguage?: SupportedLanguageCode | null },
) {
  // preferredLanguage intentionally ignored – should be stored in profiles table (non-sensitive)
  const existingProfile = loadLocalMemoryProfile(userId);

  try {
    saveLocalMemoryProfile(userId, {
      behaviourVector: vector ?? (existingProfile?.behaviourVector as BehaviourVector | null) ?? null,
    });
  } catch (error) {
    // silent fallback
  }
}

