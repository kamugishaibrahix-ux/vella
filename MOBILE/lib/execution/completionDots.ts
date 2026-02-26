/**
 * Execution Spine — 7-day completion dots (pure function).
 * Computes a visual dot state for each of the last 7 days from outcome events.
 * No side effects, no external calls. Client-computed.
 */

export type DotState = "completed" | "skipped" | "missed" | "none" | "future";

export type DayDot = {
  date: string; // YYYY-MM-DD
  state: DotState;
  dayLabel: string; // "Mon", "Tue", etc.
};

type OutcomeEvent = {
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Compute 7-day dot row for a commitment.
 * @param events - outcome events (commitment_outcome_logged) for this commitment
 * @param nowISO - current timestamp (ISO string), injectable for testing
 * @returns Array of 7 DayDot objects, oldest first (index 0 = 6 days ago, index 6 = today)
 */
export function computeCompletionDots(
  events: OutcomeEvent[],
  nowISO?: string
): DayDot[] {
  const now = nowISO ? new Date(nowISO) : new Date();
  const today = stripTime(now);

  // Build lookup: date string → best outcome for that day
  const dayOutcomes = new Map<string, DotState>();

  for (const event of events) {
    const meta = event.metadata as Record<string, unknown> | null;
    const outcomeCode = meta?.outcome_code;
    if (typeof outcomeCode !== "string") continue;

    const eventDate = stripTime(new Date(event.occurred_at));
    const dateKey = toDateKey(eventDate);

    const state = parseOutcomeCode(outcomeCode);
    if (!state) continue;

    // Priority: completed > skipped > missed
    const existing = dayOutcomes.get(dateKey);
    if (!existing || priority(state) > priority(existing)) {
      dayOutcomes.set(dateKey, state);
    }
  }

  // Generate 7 days
  const dots: DayDot[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = toDateKey(d);
    const dayLabel = DAY_LABELS[d.getDay()];
    const state = dayOutcomes.get(dateKey) ?? "none";
    dots.push({ date: dateKey, state, dayLabel });
  }

  return dots;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseOutcomeCode(code: string): DotState | null {
  if (code === "completed") return "completed";
  if (code === "skipped") return "skipped";
  if (code === "missed") return "missed";
  return null;
}

function priority(state: DotState): number {
  switch (state) {
    case "completed": return 3;
    case "skipped": return 2;
    case "missed": return 1;
    default: return 0;
  }
}
