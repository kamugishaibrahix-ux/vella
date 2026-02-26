/**
 * Home State Label — pure deterministic mapper.
 * Maps available behavioural + execution signals → state label, chips, suggestion.
 * No side effects. No API calls. No AI.
 */

// ---------------------------------------------------------------------------
// Input shape (caller assembles from available signals)
// ---------------------------------------------------------------------------

export type StateLabelInput = {
  /** consistencyScore 0–1 from progress or behavioural state */
  consistency: number;
  /** stabilityScore 0–1 */
  stability: number;
  /** improvementScore 0–1 */
  improvement: number;
  /** Number of unread missed-window inbox items */
  missedWindows: number;
  /** Number of unread inbox items total */
  unreadInbox: number;
  /** Active commitment count */
  activeCommitments: number;
  /** Triggers used today */
  triggersUsed: number;
  /** Max triggers per day */
  triggersCap: number;
  /** Streak days from fired keys */
  streakDays: number;
};

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export type StateLabel = "Stable" | "Building" | "Drifting" | "Under Load" | "Rebuilding" | "Starting";

export type StateChip = {
  label: string;
  value: string;
};

export type StateLabelResult = {
  label: StateLabel;
  chips: StateChip[];
  suggestion: string;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

export function computeStateLabel(input: StateLabelInput): StateLabelResult {
  const label = deriveLabel(input);
  const chips = deriveChips(input);
  const suggestion = deriveSuggestion(input, label);
  return { label, chips, suggestion };
}

// ---------------------------------------------------------------------------
// Label derivation (deterministic priority cascade)
// ---------------------------------------------------------------------------

function deriveLabel(i: StateLabelInput): StateLabel {
  // No data yet
  if (i.activeCommitments === 0 && i.streakDays === 0 && i.consistency === 0) {
    return "Starting";
  }

  // Missed windows → under load
  if (i.missedWindows >= 2) return "Under Load";

  // Low stability + low consistency → drifting
  if (i.stability < 0.35 && i.consistency < 0.3) return "Drifting";

  // Recovering from drift: consistency still low but improving
  if (i.consistency < 0.4 && i.improvement > 0.55) return "Rebuilding";

  // Good stability + reasonable consistency → stable
  if (i.stability >= 0.5 && i.consistency >= 0.4) return "Stable";

  // Otherwise building
  return "Building";
}

// ---------------------------------------------------------------------------
// Chips (max 3)
// ---------------------------------------------------------------------------

function deriveChips(i: StateLabelInput): StateChip[] {
  const chips: StateChip[] = [];

  // Consistency chip
  const consistencyDays = Math.round(i.consistency * 7);
  chips.push({ label: "Consistency", value: `${consistencyDays}/7` });

  // Focus chip from stability
  const focusLevel = i.stability >= 0.6 ? "High" : i.stability >= 0.35 ? "OK" : "Low";
  chips.push({ label: "Focus", value: focusLevel });

  // Risk chip
  const risk = i.missedWindows >= 2 ? "High" : i.missedWindows >= 1 || i.stability < 0.3 ? "Med" : "Low";
  chips.push({ label: "Risk", value: risk });

  return chips.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Suggestion (single deterministic line)
// ---------------------------------------------------------------------------

function deriveSuggestion(i: StateLabelInput, label: StateLabel): string {
  // Unread inbox takes priority
  if (i.unreadInbox > 0) {
    return `Resolve ${i.unreadInbox} unread item${i.unreadInbox === 1 ? "" : "s"} in your inbox.`;
  }

  // Missed windows
  if (i.missedWindows > 0) {
    return "Review missed windows and decide what to keep.";
  }

  // State-based fallbacks
  switch (label) {
    case "Starting":
      return "Set a direction to get started.";
    case "Drifting":
      return "A single check-in can restart momentum.";
    case "Rebuilding":
      return "Stay with the rhythm — it's working.";
    case "Under Load":
      return "Reduce scope or pause one commitment.";
    case "Building":
      return i.triggersUsed >= i.triggersCap && i.triggersCap > 0
        ? "Daily limit reached — rest and return tomorrow."
        : "Keep showing up. Consistency compounds.";
    case "Stable":
      return "All clear. Stay the course.";
  }
}
