/**
 * Vella session and message store (localStorage only).
 * No Supabase. No free-text in cloud. Hard session separation.
 */

import type { SessionSummary } from "./summariseSession";

export type SessionKind = "talk" | "reflect" | "plan" | "work-through";

export type VellaSession = {
  sessionId: string;
  kind: SessionKind;
  title: string | null;
  createdAt: string;
  closedAt: string | null;
  deletedAt: string | null;
  messageCount: number;
  lastMessageAt: string;
};

export type VellaMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const STORAGE_KEYS = {
  sessions: "vella_sessions",
  messages: "vella_messages",
  activeSessionId: "vella_active_session_id",
  summaries: "vella_session_summaries",
} as const;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function normalizeSession(s: Partial<VellaSession> & { sessionId: string }): VellaSession {
  return {
    ...s,
    kind: (s.kind as SessionKind) ?? "talk",
    title: s.title ?? null,
    createdAt: s.createdAt ?? new Date().toISOString(),
    closedAt: s.closedAt ?? null,
    deletedAt: s.deletedAt ?? null,
    messageCount: s.messageCount ?? 0,
    lastMessageAt: s.lastMessageAt ?? s.createdAt ?? new Date().toISOString(),
  } as VellaSession;
}

/** All sessions (metadata only). Excludes soft-deleted. */
export function getAllSessions(): VellaSession[] {
  const list = readJson<(Partial<VellaSession> & { sessionId: string })[]>(STORAGE_KEYS.sessions, []);
  const active = list.filter((s) => !s.deletedAt).map(normalizeSession);
  return active.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
}

/** All messages (keyed by sessionId in memory; stored as flat list). */
function getAllMessages(): VellaMessage[] {
  return readJson<VellaMessage[]>(STORAGE_KEYS.messages, []);
}

function persistSessions(sessions: VellaSession[]): void {
  writeJson(STORAGE_KEYS.sessions, sessions);
}

function persistMessages(messages: VellaMessage[]): void {
  writeJson(STORAGE_KEYS.messages, messages);
}

export function getActiveSessionId(): string | null {
  return readJson<string | null>(STORAGE_KEYS.activeSessionId, null);
}

export function setActiveSessionId(sessionId: string): void {
  writeJson(STORAGE_KEYS.activeSessionId, sessionId);
}

export function getSession(sessionId: string): VellaSession | null {
  const list = readJson<(Partial<VellaSession> & { sessionId: string })[]>(STORAGE_KEYS.sessions, []);
  const s = list.find((x) => x.sessionId === sessionId);
  if (!s || s.deletedAt) return null;
  return normalizeSession(s);
}

export function getMessagesForSession(sessionId: string): VellaMessage[] {
  const list = getAllMessages().filter((m) => m.sessionId === sessionId);
  return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function generateId(): string {
  return crypto.randomUUID();
}

/** Deterministic title from first user message; fallback "Session — MMM dd". */
export function deriveTitleFromFirstMessage(firstUserContent: string | null): string {
  if (!firstUserContent || !firstUserContent.trim()) {
    return `Session — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  const lower = firstUserContent.toLowerCase().trim().slice(0, 80);
  const maps: [RegExp, string][] = [
    [/quit\s+smoking|smoking\s+quit|stop\s+smoking/i, "Smoking discussion"],
    [/alcohol|drinking|sober/i, "Alcohol discussion"],
    [/focus|concentrat|distract|productiv/i, "Focus discussion"],
    [/anxiety|stress|overwhelm|worr/i, "Stress & anxiety"],
    [/sleep|insomnia|tired/i, "Sleep"],
    [/habit|routine|consist/i, "Habits"],
    [/goal|commit|stick/i, "Goals & commitment"],
  ];
  for (const [re, title] of maps) {
    if (re.test(lower)) return title;
  }
  const firstFew = firstUserContent.trim().slice(0, 30);
  return firstFew ? `${firstFew}${firstFew.length >= 30 ? "…" : ""}` : `Session — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** Create a new session and set it active. */
export function createSession(kind: SessionKind = "talk"): VellaSession {
  const sessionId = generateId();
  const now = new Date().toISOString();
  const session: VellaSession = {
    sessionId,
    kind,
    title: null,
    createdAt: now,
    closedAt: null,
    deletedAt: null,
    messageCount: 0,
    lastMessageAt: now,
  };
  const raw = readJson<VellaSession[]>(STORAGE_KEYS.sessions, []);
  raw.push(session);
  persistSessions(raw);
  setActiveSessionId(sessionId);
  return session;
}

/** Mark session closed (closedAt = now). */
export function closeSession(sessionId: string): void {
  const now = new Date().toISOString();
  const raw = readJson<VellaSession[]>(STORAGE_KEYS.sessions, []);
  const s = raw.find((x) => x.sessionId === sessionId);
  if (s) {
    s.closedAt = now;
    persistSessions(raw);
  }
}

/** Update session fields (e.g. title for rename). */
export function updateSession(
  sessionId: string,
  patch: Partial<Pick<VellaSession, "title" | "kind">>
): void {
  const raw = readJson<VellaSession[]>(STORAGE_KEYS.sessions, []);
  const s = raw.find((x) => x.sessionId === sessionId);
  if (s) {
    if (patch.title !== undefined) s.title = patch.title;
    if (patch.kind !== undefined) s.kind = patch.kind;
    persistSessions(raw);
  }
}

/** Soft delete: set deletedAt so session is excluded from getAllSessions. */
export function deleteSession(sessionId: string): void {
  const now = new Date().toISOString();
  const raw = readJson<VellaSession[]>(STORAGE_KEYS.sessions, []);
  const s = raw.find((x) => x.sessionId === sessionId);
  if (s) {
    s.deletedAt = now;
    persistSessions(raw);
  }
}

/** Duplicate session: new session with same kind, no messages. */
export function duplicateSession(sessionId: string): VellaSession {
  const s = getSession(sessionId);
  return createSession(s?.kind ?? "talk");
}

/** Add a message and update session messageCount/lastMessageAt. */
export function addMessage(message: Omit<VellaMessage, "id" | "createdAt">): VellaMessage {
  const now = new Date().toISOString();
  const msg: VellaMessage = {
    ...message,
    id: generateId(),
    createdAt: now,
  };
  const messages = getAllMessages();
  messages.push(msg);
  persistMessages(messages);

  const raw = readJson<VellaSession[]>(STORAGE_KEYS.sessions, []);
  const session = raw.find((s) => s.sessionId === message.sessionId);
  if (session) {
    session.messageCount = getMessagesForSession(message.sessionId).length;
    session.lastMessageAt = now;
    if (session.messageCount === 1 && message.role === "user") {
      session.title = deriveTitleFromFirstMessage(message.content);
    }
    persistSessions(raw);
  }
  return msg;
}

/** Ensure an active session exists; create one if none. Returns active session id. */
export function ensureActiveSession(): string {
  let activeId = getActiveSessionId();
  const sessions = getAllSessions();
  const activeSession = activeId ? sessions.find((s) => s.sessionId === activeId) : null;
  if (activeSession && !activeSession.closedAt) {
    return activeId!;
  }
  const newSession = createSession();
  return newSession.sessionId;
}

/** Session summaries (structured only), keyed by sessionId. */
export function getSessionSummary(sessionId: string): SessionSummary | null {
  const map = readJson<Record<string, SessionSummary>>(STORAGE_KEYS.summaries, {});
  return map[sessionId] ?? null;
}

export function saveSessionSummary(sessionId: string, summary: SessionSummary): void {
  const map = readJson<Record<string, SessionSummary>>(STORAGE_KEYS.summaries, {});
  map[sessionId] = summary;
  writeJson(STORAGE_KEYS.summaries, map);
}
