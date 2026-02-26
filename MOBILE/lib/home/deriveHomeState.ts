"use client";

/**
 * Home State Selector — client-only.
 * Derives deterministic home state from existing local + server sources.
 * Fetches 3 endpoints once on mount — no polling, no AI calls.
 * Falls back gracefully to local-only data when offline.
 */

import { ensureUserId } from "@/lib/local/ensureUserId";
import { listItems } from "@/lib/local/db/inboxRepo";
import { loadExecutionState } from "@/lib/execution/persistedState";
import { resolveGuardrails, isTriggerEngineEnabled } from "@/lib/execution/guardrails";
import { computeCurrentWindow } from "@/lib/execution/triggerEngine";
import { loadLocalSummary } from "@/lib/local/conversationLocal";
import type { InboxItem, CommitmentMetadata } from "@/lib/execution/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HomeState = {
  // --- Behavioural state (from /api/state/current or fallback) ---
  consistency: number;      // 0–1
  stability: number;        // 0–1
  improvement: number;      // 0–1
  connectionScore: number;  // 0–100

  // --- Execution (localStorage) ---
  triggerUsage: { used: number; cap: number };
  triggerEngineOn: boolean;
  streakDays: number;

  // --- Inbox (IndexedDB) ---
  inboxItems: InboxItem[];
  missedCount: number;
  unreadCount: number;

  // --- Commitments (API, fetched once) ---
  commitments: CommitmentMetadata[];
  activeCommitmentCount: number;

  // --- Windows ---
  windowsAheadToday: number;

  // --- Connection moment ---
  shortEmotionalLine: string;
};

// ---------------------------------------------------------------------------
// Fetchers (existing endpoints, no new queries)
// ---------------------------------------------------------------------------

async function fetchActiveCommitments(): Promise<CommitmentMetadata[]> {
  try {
    const res = await fetch("/api/commitments/list", { credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.commitments ?? []) as CommitmentMetadata[];
  } catch {
    return [];
  }
}

type ConnectionPayload = {
  score: number;
  shortEmotionalLine: string;
};

async function fetchConnectionDashboard(): Promise<ConnectionPayload> {
  const fallback: ConnectionPayload = { score: 0, shortEmotionalLine: "I'm here when you're ready." };
  try {
    const res = await fetch("/api/connection-index", { method: "GET", cache: "no-store", credentials: "include" });
    if (!res.ok) return fallback;
    const payload = await res.json();
    const d = payload.dashboard;
    if (!d) return fallback;
    return {
      score: typeof d.score === "number" ? Math.max(0, Math.min(100, Math.round(d.score))) : 0,
      shortEmotionalLine: typeof d.shortEmotionalLine === "string" && d.shortEmotionalLine
        ? d.shortEmotionalLine
        : fallback.shortEmotionalLine,
    };
  } catch {
    return fallback;
  }
}

type BehaviouralPayload = {
  consistency: number;
  stability: number;
  improvement: number;
  connectionDepth: number;
};

async function fetchBehaviouralState(): Promise<BehaviouralPayload> {
  const fallback: BehaviouralPayload = { consistency: 0, stability: 0.6, improvement: 0.5, connectionDepth: 0 };
  try {
    const res = await fetch("/api/state/current", { credentials: "include" });
    if (!res.ok) return fallback;
    const payload = await res.json();
    const s = payload.state as Record<string, unknown> | undefined;
    if (!s) return fallback;

    const progress = (s.progress && typeof s.progress === "object" ? s.progress : {}) as Record<string, unknown>;
    return {
      consistency: safeNum(progress.consistencyScore, 0),
      stability: safeNum(progress.stabilityScore, 0.6),
      improvement: safeNum(progress.improvementScore, 0.5),
      connectionDepth: safeNum(s.connection_depth, 0),
    };
  } catch {
    return fallback;
  }
}

function safeNum(val: unknown, fallback: number): number {
  return typeof val === "number" && Number.isFinite(val) ? val : fallback;
}

// ---------------------------------------------------------------------------
// Streak from fired keys
// ---------------------------------------------------------------------------

function computeStreakFromFiredKeys(firedKeys: string[]): number {
  if (!firedKeys.length) return 0;
  const days = new Set<string>();
  for (const key of firedKeys) {
    const parts = key.split("::");
    if (parts.length >= 3) {
      const iso = parts.slice(2).join("::");
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        days.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }
    }
  }
  if (!days.size) return 0;

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  let streak = 0;
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(todayKey)) cursor.setDate(cursor.getDate() - 1);

  while (true) {
    const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (days.has(k)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Windows ahead today
// ---------------------------------------------------------------------------

function countWindowsAheadToday(commitments: CommitmentMetadata[], now: Date): number {
  const tz = now.getTimezoneOffset();
  let count = 0;
  for (const c of commitments) {
    if (c.status !== "active") continue;
    const w = computeCurrentWindow(c, now, tz);
    if (w) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Connection moment fallback
// ---------------------------------------------------------------------------

function resolveEmotionalLine(
  dashboardLine: string,
  userId: string,
): string {
  // Prefer the dashboard line if it's non-generic
  if (dashboardLine && dashboardLine !== "I'm here when you're ready.") {
    return dashboardLine;
  }
  // Fallback to local conversation summary snippet
  const summary = loadLocalSummary(userId);
  if (summary?.summary) {
    return "You've been showing up even when it's messy.";
  }
  return "I'm here when you're ready.";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function deriveHomeState(userId?: string | null): Promise<HomeState> {
  const uid = ensureUserId(userId);
  const now = new Date();

  // Parallel fetches — all 3 are independent
  const [inboxItems, commitments, connectionData, behaviouralData] = await Promise.all([
    listItems(uid).catch(() => [] as InboxItem[]),
    fetchActiveCommitments().catch(() => [] as CommitmentMetadata[]),
    fetchConnectionDashboard().catch(() => ({ score: 0, shortEmotionalLine: "I'm here when you're ready." })),
    fetchBehaviouralState().catch(() => ({ consistency: 0, stability: 0.6, improvement: 0.5, connectionDepth: 0 })),
  ]);

  const execState = loadExecutionState(now);
  const guardrails = resolveGuardrails();
  const streak = computeStreakFromFiredKeys(execState.firedKeys);
  const missedCount = inboxItems.filter(
    (i) => i.template_code === "missed_window" && i.status === "unread"
  ).length;
  const unreadCount = inboxItems.filter((i) => i.status === "unread").length;
  const activeCommitments = commitments.filter((c) => c.status === "active");

  // Use connection dashboard score, fall back to behavioural state depth
  const connectionScore = connectionData.score > 0
    ? connectionData.score
    : Math.round(behaviouralData.connectionDepth);

  return {
    consistency: behaviouralData.consistency,
    stability: behaviouralData.stability,
    improvement: behaviouralData.improvement,
    connectionScore,
    triggerUsage: {
      used: execState.triggerCountToday,
      cap: guardrails.max_triggers_per_day,
    },
    triggerEngineOn: isTriggerEngineEnabled(),
    streakDays: streak,
    inboxItems,
    missedCount,
    unreadCount,
    commitments,
    activeCommitmentCount: activeCommitments.length,
    windowsAheadToday: countWindowsAheadToday(commitments, now),
    shortEmotionalLine: resolveEmotionalLine(connectionData.shortEmotionalLine, uid),
  };
}
