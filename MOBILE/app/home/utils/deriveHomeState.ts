/**
 * Governance Home State — pure deterministic mapper.
 * Maps governance state signals → display label, summary, severity.
 * No side effects. No API calls. No AI. No raw risk_score exposure.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GovernanceClientState = {
  recoveryState: string;
  disciplineState: string;
  focusState: string;
  escalationLevel: number;
  toneBand: "steady" | "supportive" | "grounding";
  lastComputedAtIso: string | null;
};

export type HomeDisplayState = {
  label: string;
  summary: string;
  severity: "stable" | "warning" | "elevated";
};

// ---------------------------------------------------------------------------
// Mapper (deterministic priority cascade)
// ---------------------------------------------------------------------------

/**
 * Deterministic priority cascade for home display state.
 * Inputs: governance spine state + consecutive missed windows count.
 * No LLM. No AI. Pure rules.
 */
export function deriveHomeDisplayState(
  governance: GovernanceClientState,
  consecutiveMisses: number,
): HomeDisplayState {
  // 1. Recovery Active — relapse detected
  if (governance.recoveryState === "relapse") {
    return {
      label: "Recovery Active",
      summary: "Streak reset. Rebuilding.",
      severity: "elevated",
    };
  }

  // 2. At Risk — 3+ consecutive misses or max escalation
  if (consecutiveMisses >= 3) {
    return {
      label: "At Risk",
      summary: `${consecutiveMisses} consecutive misses detected.`,
      severity: "elevated",
    };
  }

  if (governance.escalationLevel >= 3) {
    return {
      label: "At Risk",
      summary: "Multiple domains need attention.",
      severity: "elevated",
    };
  }

  // 3. Needs Attention — escalation active or recovery risk
  if (
    governance.escalationLevel >= 1 ||
    governance.recoveryState === "at_risk" ||
    governance.disciplineState === "off_track"
  ) {
    return {
      label: "Needs Attention",
      summary: resolveAttentionSummary(governance),
      severity: "warning",
    };
  }

  // 4. Stable
  return {
    label: "Stable",
    summary: "You\u2019re on track across active commitments.",
    severity: "stable",
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveAttentionSummary(governance: GovernanceClientState): string {
  if (governance.disciplineState === "off_track") return "Commitments are off track.";
  if (governance.disciplineState === "slipping") return "Commitments are slipping.";
  if (governance.recoveryState === "at_risk") return "Recovery needs attention.";
  if (governance.focusState === "overdue") return "A focus session is overdue.";
  if (governance.focusState === "idle") return "Focus sessions have gone quiet.";
  return "Some areas need a closer look.";
}
