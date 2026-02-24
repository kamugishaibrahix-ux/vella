import { v4 as uuid } from "uuid";

import { listItems, loadItem, removeItem, saveItem } from "./safeStorage";

export type LocalConversationRole = "user" | "assistant";

export interface LocalConversationMessage {
  id: string;
  role: LocalConversationRole;
  content: string;
  createdAt: string;
}

export interface LocalConversationSummary {
  id: string;
  summary: string;
  updatedAt: string;
}

export interface LocalMemoryProfile {
  emotionalMemory?: unknown;
  behaviourVector?: unknown;
  insights?: unknown;
  updatedAt: string;
}

const CONV_NS = "conversation" as const;
const SUMMARY_ID = "summary";
const MEMORY_ID = "memory";

// messages

export function appendMessage(message: Omit<LocalConversationMessage, "id" | "createdAt">) {
  const id = uuid();
  const createdAt = new Date().toISOString();
  const record: LocalConversationMessage = { id, createdAt, ...message };
  saveItem(CONV_NS, id, record);
  return record;
}

export function getRecentMessages(limit = 30): LocalConversationMessage[] {
  const all = listItems<LocalConversationMessage>(CONV_NS);
  return all
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit);
}

export function getFullHistory(): LocalConversationMessage[] {
  const all = listItems<LocalConversationMessage>(CONV_NS);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function clearConversationHistory() {
  const all = listItems<LocalConversationMessage>(CONV_NS);
  for (const msg of all) {
    removeItem(CONV_NS, msg.id);
  }
}

// summary

export function loadConversationSummary(): LocalConversationSummary | null {
  return loadItem<LocalConversationSummary>(CONV_NS, SUMMARY_ID);
}

export function saveConversationSummary(summary: string) {
  const record: LocalConversationSummary = {
    id: SUMMARY_ID,
    summary,
    updatedAt: new Date().toISOString(),
  };
  saveItem(CONV_NS, SUMMARY_ID, record);
  return record;
}

// memory profile

export function loadLocalMemoryProfile(): LocalMemoryProfile | null {
  return loadItem<LocalMemoryProfile>(CONV_NS, MEMORY_ID);
}

export function saveLocalMemoryProfile(update: Partial<LocalMemoryProfile>) {
  const current = loadLocalMemoryProfile();
  const next: LocalMemoryProfile = {
    emotionalMemory: current?.emotionalMemory,
    behaviourVector: current?.behaviourVector,
    insights: current?.insights,
    updatedAt: new Date().toISOString(),
    ...update,
  };
  saveItem(CONV_NS, MEMORY_ID, next);
  return next;
}

