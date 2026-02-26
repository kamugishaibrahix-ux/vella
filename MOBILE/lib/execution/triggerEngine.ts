/**
 * Execution Spine — Phase 2: Trigger Engine (pure functions).
 * Deterministic window computation and trigger-fire decision logic.
 * No randomness, no LLM, no side effects.
 */

import type {
  CommitmentMetadata,
  ScheduleWindow,
  TriggerState,
  GuardrailConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Window computation
// ---------------------------------------------------------------------------

/**
 * Compute the current schedule window for a recurring commitment.
 * For "recurring" cadence: window is [start_of_today, end_of_today] in user's timezone.
 * For "deadline" cadence: window is [now, deadline_at].
 * Returns null if commitment is not active, has no valid start, or deadline has passed.
 */
export function computeCurrentWindow(
  commitment: CommitmentMetadata,
  now: Date,
  timezoneOffsetMinutes: number = 0
): ScheduleWindow | null {
  if (commitment.status !== "active") return null;

  const startAt = new Date(commitment.start_at);
  if (isNaN(startAt.getTime())) return null;

  // Commitment hasn't started yet
  if (now < startAt) return null;

  // Commitment has ended
  if (commitment.end_at) {
    const endAt = new Date(commitment.end_at);
    if (!isNaN(endAt.getTime()) && now > endAt) return null;
  }

  if (commitment.cadence_type === "deadline") {
    if (!commitment.deadline_at) return null;
    const deadline = new Date(commitment.deadline_at);
    if (isNaN(deadline.getTime()) || now > deadline) return null;
    return {
      commitment_id: commitment.id,
      window_start: startAt > now ? startAt : now,
      window_end: deadline,
    };
  }

  // Recurring: daily window in user's local day
  const localNow = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const dayStart = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    0, 0, 0, 0
  ));
  const dayEnd = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    23, 59, 59, 999
  ));

  // Shift back to UTC
  const windowStart = new Date(dayStart.getTime() + timezoneOffsetMinutes * 60_000);
  const windowEnd = new Date(dayEnd.getTime() + timezoneOffsetMinutes * 60_000);

  return {
    commitment_id: commitment.id,
    window_start: windowStart,
    window_end: windowEnd,
  };
}

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

/** Build the idempotency key for a trigger fire. */
export function buildIdempotencyKey(commitmentId: string, windowStart: Date): string {
  return `${commitmentId}::${windowStart.toISOString()}`;
}

// ---------------------------------------------------------------------------
// Should-fire decision
// ---------------------------------------------------------------------------

export type ShouldFireResult =
  | { fire: true; window: ScheduleWindow; idempotencyKey: string }
  | { fire: false; reason: string };

/**
 * Determine whether a trigger should fire for a commitment.
 * Pure function: all inputs explicit, no side effects.
 */
export function shouldFireTrigger(
  commitment: CommitmentMetadata,
  now: Date,
  timezoneOffsetMinutes: number,
  lastTriggerStates: Map<string, TriggerState>,
  guardrails: GuardrailConfig,
  triggerCountToday: number
): ShouldFireResult {
  const window = computeCurrentWindow(commitment, now, timezoneOffsetMinutes);
  if (!window) {
    return { fire: false, reason: "no_active_window" };
  }

  // Check if we're inside the window
  if (now < window.window_start || now > window.window_end) {
    return { fire: false, reason: "outside_window" };
  }

  // Idempotency: already fired for this window?
  const key = buildIdempotencyKey(commitment.id, window.window_start);
  const existing = lastTriggerStates.get(key);
  if (existing) {
    return { fire: false, reason: "already_fired" };
  }

  // Guardrail: max triggers per day
  if (triggerCountToday >= guardrails.max_triggers_per_day) {
    return { fire: false, reason: "max_triggers_per_day" };
  }

  // Guardrail: cooldown — check last fire for this commitment (any window)
  const commitmentStates = Array.from(lastTriggerStates.entries())
    .filter(([k]) => k.startsWith(commitment.id + "::"))
    .map(([, v]) => v);
  if (commitmentStates.length > 0) {
    const lastFired = commitmentStates.reduce((latest, s) =>
      s.last_fired_at > latest.last_fired_at ? s : latest
    );
    const cooldownMs = guardrails.cooldown_minutes * 60_000;
    const elapsed = now.getTime() - new Date(lastFired.last_fired_at).getTime();
    if (elapsed < cooldownMs) {
      return { fire: false, reason: "cooldown" };
    }
  }

  // Guardrail: quiet hours
  if (guardrails.quiet_hours_start !== null && guardrails.quiet_hours_end !== null) {
    const localNow = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
    const hour = localNow.getUTCHours();
    const start = guardrails.quiet_hours_start;
    const end = guardrails.quiet_hours_end;
    const inQuiet = start <= end
      ? hour >= start && hour < end
      : hour >= start || hour < end; // wraps midnight
    if (inQuiet) {
      return { fire: false, reason: "quiet_hours" };
    }
  }

  return { fire: true, window, idempotencyKey: key };
}
