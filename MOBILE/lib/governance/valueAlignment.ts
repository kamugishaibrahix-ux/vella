/**
 * Phase 7 — Value Alignment.
 * Detects tension between declared value codes and recent behaviour.
 * Deterministic only. No free text. Server sees only value_code strings.
 */

export type ValueAlignmentSignals = {
  misalignmentDetected: boolean;
  alignedValues: string[];
  misalignedValues: string[];
  reasons: string[];
};

/** Allowlisted reason codes. */
export const VALUE_ALIGNMENT_REASON_CODES = [
  "DISCIPLINE_VIOLATION",
  "HEALTH_CONFLICT",
  "VALUES_ALIGNED",
] as const;

export type ValueAlignmentReasonCode = (typeof VALUE_ALIGNMENT_REASON_CODES)[number];

/** Value codes we map to behaviour. Others are not used for misalignment. */
const VALUE_CODES_FOR_ALIGNMENT = ["discipline", "honesty", "health", "growth", "self_respect"] as const;

export type DetectValueAlignmentInput = {
  activeValues: string[];
  violationCounts7d: {
    commitmentViolations7d: number;
    abstinenceViolations7d: number;
    commitmentCompleted7d?: number;
  };
  contradictionDetected?: boolean;
  /** Snapshot for context; alignment uses violationCounts7d and activeValues only. */
  behaviourSnapshot?: Record<string, unknown>;
};

export function detectValueAlignment(input: DetectValueAlignmentInput): ValueAlignmentSignals {
  const {
    activeValues,
    violationCounts7d,
    contradictionDetected = false,
    behaviourSnapshot,
  } = input;

  const commitmentViolations7d = violationCounts7d.commitmentViolations7d;
  const abstinenceViolations7d = violationCounts7d.abstinenceViolations7d;
  const commitmentCompleted7d = violationCounts7d.commitmentCompleted7d ?? 0;

  const alignedValues: string[] = [];
  const misalignedValues: string[] = [];
  const reasons: string[] = [];

  const violationsLow = commitmentViolations7d <= 1 && abstinenceViolations7d === 0;
  const completionsHigh = commitmentCompleted7d >= 3;

  if (activeValues.length === 0) {
    return {
      misalignmentDetected: false,
      alignedValues: [],
      misalignedValues: [],
      reasons: [],
    };
  }

  for (const valueCode of activeValues) {
    const code = valueCode.toLowerCase().trim();
    if (!code) continue;

    if (code === "discipline" && commitmentViolations7d >= 2) {
      misalignedValues.push(valueCode);
      if (!reasons.includes("DISCIPLINE_VIOLATION")) reasons.push("DISCIPLINE_VIOLATION");
    } else if (code === "health" && abstinenceViolations7d >= 1) {
      misalignedValues.push(valueCode);
      if (!reasons.includes("HEALTH_CONFLICT")) reasons.push("HEALTH_CONFLICT");
    } else if (VALUE_CODES_FOR_ALIGNMENT.includes(code as (typeof VALUE_CODES_FOR_ALIGNMENT)[number])) {
      if (completionsHigh && violationsLow) {
        alignedValues.push(valueCode);
        if (!reasons.includes("VALUES_ALIGNED")) reasons.push("VALUES_ALIGNED");
      }
    }
  }

  // Any declared value that wasn't marked misaligned and is in our set can be considered aligned if behaviour is good
  if (completionsHigh && violationsLow && alignedValues.length === 0 && misalignedValues.length === 0) {
    for (const valueCode of activeValues) {
      const code = valueCode.toLowerCase().trim();
      if (VALUE_CODES_FOR_ALIGNMENT.includes(code as (typeof VALUE_CODES_FOR_ALIGNMENT)[number])) {
        alignedValues.push(valueCode);
      }
    }
    if (alignedValues.length > 0 && !reasons.includes("VALUES_ALIGNED")) reasons.push("VALUES_ALIGNED");
  }

  const misalignmentDetected = misalignedValues.length > 0;

  return {
    misalignmentDetected,
    alignedValues: Array.from(new Set(alignedValues)),
    misalignedValues: Array.from(new Set(misalignedValues)),
    reasons: Array.from(new Set(reasons)),
  };
}
