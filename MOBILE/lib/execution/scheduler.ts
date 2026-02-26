/**
 * Execution Spine — Phase 2: Foreground-only Scheduler.
 * Runs a 60s interval when the app is visible/foregrounded.
 * Evaluates active commitments and fires triggers via the API.
 * Stops when backgrounded to avoid battery drain.
 * OFF by default — controlled by dev toggle in guardrails.ts.
 *
 * Reload-safe: idempotency keys and daily counter are persisted to localStorage.
 * Suppression storm prevention: one log per (commitment, window, reason) per day.
 * Daily cap uses LOCAL day boundaries, not UTC.
 */

import { shouldFireTrigger, computeCurrentWindow } from "./triggerEngine";
import { resolveGuardrails, isTriggerEngineEnabled } from "./guardrails";
import type { CommitmentMetadata, TriggerState, TriggerFireMetadata, TriggerSuppressedMetadata, SuppressionReasonCode } from "./types";
import { addItem as addInboxItem, inboxIdempotencyKey, listItems } from "@/lib/local/db/inboxRepo";
import { ensureUserId } from "@/lib/local/ensureUserId";
import {
  loadExecutionState,
  saveExecutionState,
  resetIfNewLocalDay,
  buildFiredIdempotencyKey,
  buildSuppressedIdempotencyKey,
  type ExecutionState,
} from "./persistedState";

// ---------------------------------------------------------------------------
// Session-aware nudge helpers
// ---------------------------------------------------------------------------

const VOICE_SESSION_KEY = "vella_voice_session_active";
const SESSION_NUDGE_KEY = "vella_session_nudge";

function isVoiceSessionActive(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  return window.localStorage.getItem(VOICE_SESSION_KEY) === "true";
}

export function setVoiceSessionActive(active: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(VOICE_SESSION_KEY, active ? "true" : "false");
}

function writeSessionNudge(templateCode: string, commitmentId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const nudge = { template_code: templateCode, commitment_id: commitmentId, created_at: new Date().toISOString() };
  try {
    window.localStorage.setItem(SESSION_NUDGE_KEY, JSON.stringify(nudge));
  } catch { /* best-effort */ }
}

export function readSessionNudge(): { template_code: string; commitment_id: string; created_at: string } | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_NUDGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function clearSessionNudge(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(SESSION_NUDGE_KEY);
}

const TICK_INTERVAL_MS = 60_000; // 60 seconds

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let intervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/** Persisted execution state — loaded from localStorage on init, synced on every mutation. */
let execState: ExecutionState | null = null;

/**
 * In-memory cache for shouldFireTrigger's triggerStates param.
 * Rebuilt from execState.firedKeys on load so triggerEngine sees prior fires.
 */
const triggerStates = new Map<string, TriggerState>();

function ensureState(now: Date): ExecutionState {
  if (!execState) {
    execState = loadExecutionState(now);
    rebuildTriggerStatesFromPersisted(execState);
  }
  return resetIfNewLocalDay(now, execState);
}

/** Populate the in-memory triggerStates Map from persisted firedKeys. */
function rebuildTriggerStatesFromPersisted(state: ExecutionState): void {
  triggerStates.clear();
  for (const key of state.firedKeys) {
    // firedKeys have format "trigger_fired::commitmentId::windowStartIso"
    // Extract commitmentId::windowStartIso as the engine idempotency key
    const parts = key.split("::");
    if (parts.length >= 3) {
      const engineKey = `${parts[1]}::${parts.slice(2).join("::")}`;
      triggerStates.set(engineKey, {
        last_fired_key: engineKey,
        last_fired_at: state.dayKey,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Commitment fetcher (client-side)
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

// ---------------------------------------------------------------------------
// Trigger log (client-side POST)
// ---------------------------------------------------------------------------

async function logTriggerFired(metadata: TriggerFireMetadata): Promise<boolean> {
  try {
    const res = await fetch("/api/execution/trigger/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(metadata),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function logTriggerSuppressed(metadata: TriggerSuppressedMetadata): Promise<boolean> {
  try {
    const res = await fetch("/api/execution/trigger/suppressed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(metadata),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

async function tick(): Promise<void> {
  if (!isTriggerEngineEnabled()) return;

  const now = new Date();
  const state = ensureState(now);

  const guardrails = resolveGuardrails();
  const tzOffset = now.getTimezoneOffset(); // minutes, positive = behind UTC

  const commitments = await fetchActiveCommitments();

  for (const c of commitments) {
    const result = shouldFireTrigger(
      c,
      now,
      tzOffset,
      triggerStates,
      guardrails,
      state.triggerCountToday
    );

    if (!result.fire) {
      // Log suppressed event for guardrail blocks (skip non-actionable reasons)
      const reason = result.reason as SuppressionReasonCode;
      const suppressible: SuppressionReasonCode[] = ["quiet_hours", "max_triggers_per_day", "cooldown"];
      if (suppressible.includes(reason)) {
        const window = computeCurrentWindow(c, now, tzOffset);
        const windowIso = window ? window.window_start.toISOString() : now.toISOString();
        const suppKey = buildSuppressedIdempotencyKey(c.id, windowIso, reason);

        // Only log once per (commitment, window, reason) per day — prevents storm
        if (!state.suppressedKeys.includes(suppKey)) {
          state.suppressedKeys.push(suppKey);
          saveExecutionState(state);

          await logTriggerSuppressed({
            commitment_id: c.id,
            domain_code: c.subject_code ?? "other",
            trigger_type: "window_open",
            window_start_iso: windowIso,
            reason_code: reason,
            idempotency_key: suppKey,
          });
        }
      }
      continue;
    }

    const windowStartIso = result.window.window_start.toISOString();
    const windowEndIso = result.window.window_end.toISOString();
    const firedKey = buildFiredIdempotencyKey(c.id, windowStartIso);

    // Reload-safe: check persisted firedKeys before logging
    if (state.firedKeys.includes(firedKey)) {
      continue;
    }

    const metadata: TriggerFireMetadata = {
      commitment_id: c.id,
      domain_code: c.subject_code ?? "other",
      trigger_type: "window_open",
      window_start_iso: windowStartIso,
      window_end_iso: windowEndIso,
      idempotency_key: firedKey,
    };

    const logged = await logTriggerFired(metadata);

    if (logged) {
      // Persist fired key and increment counter
      state.firedKeys.push(firedKey);
      state.triggerCountToday++;
      saveExecutionState(state);

      // Update in-memory cache for triggerEngine
      triggerStates.set(result.idempotencyKey, {
        last_fired_key: result.idempotencyKey,
        last_fired_at: now.toISOString(),
      });

      // Write local inbox item OR session nudge
      if (isVoiceSessionActive()) {
        // Voice session active — write lightweight nudge, skip inbox item
        writeSessionNudge("window_open", c.id);
      } else {
        try {
          await addInboxItem(c.user_id, {
            id: inboxIdempotencyKey(c.id, windowStartIso),
            created_at: now.toISOString(),
            commitment_id: c.id,
            domain_code: c.subject_code ?? "other",
            template_code: "window_open",
            window_start_iso: windowStartIso,
            window_end_iso: windowEndIso,
            status: "unread",
          });
        } catch {
          // Inbox write is best-effort; do not block trigger flow
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle: start / stop / visibility
// ---------------------------------------------------------------------------

function startInterval(): void {
  if (intervalId !== null) return;
  isRunning = true;
  // Run catch-up for missed windows, then fire immediately, then every 60s
  runCatchUp().then(() => tick());
  intervalId = setInterval(tick, TICK_INTERVAL_MS);
}

function stopInterval(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isRunning = false;
}

function handleVisibilityChange(): void {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") {
    if (!isRunning) startInterval();
  } else {
    stopInterval();
  }
}

/**
 * Initialise the trigger scheduler. Call once from a root-level component.
 * Returns a cleanup function to remove the listener and stop the interval.
 * Does nothing server-side.
 */
export function initScheduler(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  // Load persisted state on init
  execState = loadExecutionState(new Date());
  rebuildTriggerStatesFromPersisted(execState);

  // Only start if currently visible
  if (document.visibilityState === "visible") {
    startInterval();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    stopInterval();
  };
}

// ---------------------------------------------------------------------------
// Soft catch-up: detect missed windows (last 24h)
// ---------------------------------------------------------------------------

async function runCatchUp(): Promise<void> {
  if (!isTriggerEngineEnabled()) return;
  try {
    const userId = ensureUserId();
    const commitments = await fetchActiveCommitments();
    const now = new Date();
    const tzOffset = now.getTimezoneOffset();
    const lookback = new Date(now.getTime() - 24 * 60 * 60_000);

    // Get existing inbox items to avoid duplicates
    const existing = await listItems(userId);
    const existingIds = new Set(existing.map((i) => i.id));

    for (const c of commitments) {
      const window = computeCurrentWindow(c, now, tzOffset);
      if (!window) continue;

      // Check if the window has ended and no outcome exists in inbox
      // For recurring, the previous day's window ends at dayEnd
      // We check: if window_end is in the past AND no inbox item exists for this commitment+window
      const prevDayEnd = new Date(window.window_start.getTime() - 1);
      if (prevDayEnd < lookback) continue;

      // Compute yesterday's window
      const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
      const prevWindow = computeCurrentWindow(c, yesterday, tzOffset);
      if (!prevWindow) continue;
      if (prevWindow.window_end > now) continue; // Still active

      const windowEndIso = prevWindow.window_end.toISOString();
      const windowStartIso = prevWindow.window_start.toISOString();
      const missedKey = `${c.id}::missed::${windowEndIso}`;

      if (existingIds.has(missedKey)) continue;

      // No inbox item for this missed window — create one
      try {
        await addInboxItem(userId, {
          id: missedKey,
          created_at: now.toISOString(),
          commitment_id: c.id,
          domain_code: c.subject_code ?? "other",
          template_code: "missed_window",
          window_start_iso: windowStartIso,
          window_end_iso: windowEndIso,
          status: "unread",
        });
      } catch {
        // best-effort
      }
    }
  } catch {
    // catch-up is best-effort
  }
}

/** Expose for testing / dev console. */
export function getSchedulerState() {
  return {
    isRunning,
    triggerCountToday: execState?.triggerCountToday ?? 0,
    dayKey: execState?.dayKey ?? "",
    firedKeysCount: execState?.firedKeys.length ?? 0,
    suppressedKeysCount: execState?.suppressedKeys.length ?? 0,
    triggerStatesSize: triggerStates.size,
  };
}
