/**
 * Execution Spine — Persisted State (localStorage-backed).
 * Reload-safe storage for trigger idempotency keys and daily counters.
 * Uses LOCAL day boundaries (not UTC) for cap enforcement.
 * All keys are deterministic code strings — no personal content.
 */

const STORAGE_KEY = "vella_execution_state_v1";
const MAX_KEYS_PER_SET = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecutionState = {
  dayKey: string; // YYYY-MM-DD in LOCAL time
  triggerCountToday: number;
  firedKeys: string[];
  suppressedKeys: string[];
};

// ---------------------------------------------------------------------------
// Local day key (NOT UTC)
// ---------------------------------------------------------------------------

/**
 * Compute the local day key as YYYY-MM-DD using the system's local timezone.
 * Deliberately avoids toISOString().slice(0,10) which gives UTC.
 */
export function getLocalDayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Idempotency key builders
// ---------------------------------------------------------------------------

export function buildFiredIdempotencyKey(
  commitmentId: string,
  windowStartIso: string
): string {
  return `trigger_fired::${commitmentId}::${windowStartIso}`;
}

export function buildSuppressedIdempotencyKey(
  commitmentId: string,
  windowStartIso: string,
  reasonCode: string
): string {
  return `trigger_suppressed::${commitmentId}::${windowStartIso}::${reasonCode}`;
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

function emptyState(now: Date): ExecutionState {
  return {
    dayKey: getLocalDayKey(now),
    triggerCountToday: 0,
    firedKeys: [],
    suppressedKeys: [],
  };
}

/**
 * Load execution state from localStorage. Returns fresh state if missing/corrupt.
 */
export function loadExecutionState(now: Date): ExecutionState {
  if (typeof window === "undefined" || !window.localStorage) {
    return emptyState(now);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState(now);
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyState(now);
    if (typeof parsed.dayKey !== "string") return emptyState(now);
    return {
      dayKey: parsed.dayKey,
      triggerCountToday:
        typeof parsed.triggerCountToday === "number" && Number.isFinite(parsed.triggerCountToday)
          ? Math.max(0, Math.floor(parsed.triggerCountToday))
          : 0,
      firedKeys: Array.isArray(parsed.firedKeys) ? parsed.firedKeys.filter((k: unknown) => typeof k === "string") : [],
      suppressedKeys: Array.isArray(parsed.suppressedKeys) ? parsed.suppressedKeys.filter((k: unknown) => typeof k === "string") : [],
    };
  } catch {
    return emptyState(now);
  }
}

/**
 * Persist execution state to localStorage.
 * Caps arrays to MAX_KEYS_PER_SET to prevent unbounded growth.
 */
export function saveExecutionState(state: ExecutionState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const capped: ExecutionState = {
    ...state,
    firedKeys: state.firedKeys.slice(-MAX_KEYS_PER_SET),
    suppressedKeys: state.suppressedKeys.slice(-MAX_KEYS_PER_SET),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // localStorage full or unavailable — best-effort
  }
}

/**
 * Reset state if the local day has changed. Mutates and returns the state.
 */
export function resetIfNewLocalDay(now: Date, state: ExecutionState): ExecutionState {
  const todayKey = getLocalDayKey(now);
  if (state.dayKey !== todayKey) {
    state.dayKey = todayKey;
    state.triggerCountToday = 0;
    state.firedKeys = [];
    state.suppressedKeys = [];
  }
  return state;
}
