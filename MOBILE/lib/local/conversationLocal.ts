// MOBILE/lib/local/conversationLocal.ts
// Phase 6B: Conversation messages are durable in Supabase (conversation_messages). Local message writes are no-ops.
// Summary and memory profile remain local-only for now (no DB table yet).

import { ensureUserId } from "./ensureUserId";
import { loadLocal, saveLocal } from "./storage";

export type LocalMessageRole = "user" | "assistant" | "system";

export interface LocalConversationMessage {
  id: string;
  role: LocalMessageRole;
  content: string;
  createdAt: string;
}

export interface LocalConversationSummary {
  summary: string;
  updatedAt: string;
}

export interface LocalMemoryProfile {
  emotionalMemory?: unknown;
  behaviourVector?: unknown;
  insights?: unknown;
  updatedAt: string;
}

const MSG_PATH = (userId: string) => `conversation:${userId}:messages`;
const SUMMARY_PATH = (userId: string) => `conversation:${userId}:summary`;
const MEMORY_PATH = (userId: string) => `memory:${userId}:profile`;

/** Phase 6B: No-op. Messages persist via /api/vella/text (Supabase conversation_messages). */
export function saveLocalMessage(_userId: string | undefined, _msg: LocalConversationMessage) {
  // no-op
}

export function getLocalRecentMessages(userId: string | undefined, limit = 30): LocalConversationMessage[] {
  const uid = ensureUserId(userId);
  const all = loadLocal<LocalConversationMessage[]>(MSG_PATH(uid), []) ?? [];
  if (all.length <= limit) return all;
  return all.slice(-limit);
}

export function getLocalFullHistory(userId: string | undefined): LocalConversationMessage[] {
  const uid = ensureUserId(userId);
  return loadLocal<LocalConversationMessage[]>(MSG_PATH(uid), []) ?? [];
}

export function saveLocalSummary(userId: string | undefined, summary: string) {
  const uid = ensureUserId(userId);
  const payload: LocalConversationSummary = {
    summary,
    updatedAt: new Date().toISOString(),
  };
  saveLocal(SUMMARY_PATH(uid), payload);
}

export function loadLocalSummary(userId: string | undefined): LocalConversationSummary | null {
  const uid = ensureUserId(userId);
  return loadLocal<LocalConversationSummary | null>(SUMMARY_PATH(uid), null);
}

export function saveLocalMemoryProfile(userId: string | undefined, data: Partial<LocalMemoryProfile>) {
  const uid = ensureUserId(userId);
  const existing = loadLocal<LocalMemoryProfile | null>(MEMORY_PATH(uid), null);
  const next: LocalMemoryProfile = {
    emotionalMemory: data.emotionalMemory ?? existing?.emotionalMemory,
    behaviourVector: data.behaviourVector ?? existing?.behaviourVector,
    insights: data.insights ?? existing?.insights,
    updatedAt: new Date().toISOString(),
  };
  saveLocal(MEMORY_PATH(uid), next);
}

export function loadLocalMemoryProfile(userId: string | undefined): LocalMemoryProfile | null {
  const uid = ensureUserId(userId);
  return loadLocal<LocalMemoryProfile | null>(MEMORY_PATH(uid), null);
}

