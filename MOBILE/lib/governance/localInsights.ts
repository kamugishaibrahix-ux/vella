/**
 * Local Insights Computer.
 * Computes InsightsSnapshotResponse entirely from local data (IndexedDB + localStorage).
 * No Supabase. No fetch. No OpenAI. Pure client-side computation.
 */

import { getLocalEventsLast7d, getLocalEventsLast30d } from "@/lib/local/behaviourEventsLocal";
import { getFocusSessionsLast7d, getFocusSessionsLast30d } from "@/lib/local/focusSessionsLocal";
import { getAllCommitmentsLocal } from "@/lib/local/db/commitmentsLocalRepo";
import { ensureUserId } from "@/lib/local/ensureUserId";
import { getFocusAreas } from "@/lib/focusAreas";
import {
  computeRecoveryState,
  computeDisciplineState,
  computeFocusState,
  computeGovernanceRiskScore,
  computeEscalationLevel,
} from "./governanceCore";
import { buildBehaviourSnapshot } from "./behaviourSnapshot";
import type { ComputeLongitudinalInput } from "./trendEngine";

export type LocalInsightsSnapshotResponse = {
  condition: {
    recovery: string;
    discipline: string;
    focus: string;
    risk: number;
    escalation: number;
  };
  direction: {
    recoveryTrend: string;
    disciplineTrend: string;
    focusTrend: string;
    cycleDetected: boolean;
  };
  alignment: {
    alignedValues: string[];
    misalignedValues: string[];
  };
  friction: {
    recurringLoops: string[];
    distortions: string[];
    contradictions: boolean;
  };
  trajectory: {
    connectionDepth: number;
    progressIndex: number;
  };
};

export async function computeLocalInsightsSnapshot(): Promise<LocalInsightsSnapshotResponse> {
  // 1. Read local behaviour events
  const [events7d, events30d] = await Promise.all([
    getLocalEventsLast7d(),
    getLocalEventsLast30d(),
  ]);

  // 2. Count event types (7d)
  const commitmentViolations7d = events7d.filter((e) => e.event_type === "commitment_violation").length;
  const abstinenceViolations7d = events7d.filter((e) => e.event_type === "abstinence_violation").length;
  const commitmentCompleted7d = events7d.filter((e) => e.event_type === "commitment_completed").length;

  // Count event types (30d)
  const commitmentViolations30d = events30d.filter((e) => e.event_type === "commitment_violation").length;
  const abstinenceViolations30d = events30d.filter((e) => e.event_type === "abstinence_violation").length;
  const commitmentCompleted30d = events30d.filter((e) => e.event_type === "commitment_completed").length;

  // 3. Read local focus sessions
  const [focusSessions7d, focusSessions30d] = await Promise.all([
    getFocusSessionsLast7d(),
    getFocusSessionsLast30d(),
  ]);

  const focusCount7d = focusSessions7d.length;
  const focusCount30d = focusSessions30d.length;
  const focusCompleted7d = focusSessions7d.filter((s) => s.completed).length;

  // 4. Read local commitments
  const userId = ensureUserId();
  let activeCommitmentsCount = 0;
  let activeValues: string[] = [];
  try {
    const localCommitments = await getAllCommitmentsLocal(userId);
    activeCommitmentsCount = localCommitments.length;
    // Use commitment descriptions as rough value codes (best-effort local mapping)
    activeValues = localCommitments
      .map((c) => c.id)
      .filter((s): s is string => typeof s === "string")
      .slice(0, 20);
  } catch {
    // Commitments store may be empty or unavailable
  }

  // Also read focus areas as value signals
  try {
    const focusAreas = getFocusAreas();
    const focusDomainValues = focusAreas.map((a) => a.domain);
    activeValues = [...new Set([...activeValues, ...focusDomainValues])].slice(0, 20);
  } catch {
    // Focus areas may be unavailable
  }

  // 5. Compute governance state from local data
  const recoveryState = computeRecoveryState(0, abstinenceViolations7d);
  const disciplineState = computeDisciplineState(activeCommitmentsCount, commitmentViolations7d, commitmentCompleted7d);
  const focusState = computeFocusState(focusCount30d, focusCompleted7d, 0);
  const riskScore = computeGovernanceRiskScore(abstinenceViolations7d, commitmentViolations7d, focusState, focusCount30d);
  const escalationLevel = computeEscalationLevel(riskScore);

  // 6. Build prior trend snapshot (weekly violation counts, oldest to newest)
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const violationEvents30d = events30d.filter((e) => e.event_type === "commitment_violation");
  const byWeek: number[] = [0, 0, 0, 0];
  for (const v of violationEvents30d) {
    const t = new Date(v.occurred_at).getTime();
    const weeksAgo = (now - t) / weekMs;
    const bucket = Math.floor(weeksAgo);
    if (bucket >= 0 && bucket <= 3) byWeek[bucket]++;
  }
  const priorTrendSnapshot = [byWeek[3], byWeek[2], byWeek[1], byWeek[0]];

  // 7. Build longitudinal input
  const longitudinalInput: ComputeLongitudinalInput = {
    violationCounts30d: {
      commitmentViolations30d,
      abstinenceViolations30d,
    },
    completionCounts30d: {
      commitmentCompleted30d,
    },
    focusSessions30d: focusCount30d,
    priorTrendSnapshot,
  };

  // 8. Build governance state object for snapshot
  const governance = {
    riskScore,
    escalationLevel,
    recoveryState,
    disciplineState,
    focusState,
    lastComputedAtIso: new Date().toISOString(),
  };

  // 9. Call buildBehaviourSnapshot (already pure)
  const snapshot = buildBehaviourSnapshot(
    governance,
    {
      commitmentViolations: commitmentViolations7d,
      abstinenceViolations: abstinenceViolations7d,
      commitmentCompleted: commitmentCompleted7d,
    },
    focusCount7d,
    { contradictionDetected: false, contradictedCommitmentIds: [] },
    { boundaryTriggered: false },
    longitudinalInput,
    activeValues.length > 0 ? activeValues : null
  );

  // 10. Return InsightsSnapshotResponse shape
  // Fields from behavioural_state_current (AI-computed) are degraded to empty/zero
  return {
    condition: {
      recovery: snapshot.recoveryState,
      discipline: snapshot.disciplineState,
      focus: snapshot.focusState,
      risk: snapshot.riskScore,
      escalation: snapshot.escalationLevel,
    },
    direction: {
      recoveryTrend: snapshot.longitudinalSignals?.recoveryTrend ?? "stable",
      disciplineTrend: snapshot.longitudinalSignals?.disciplineTrend ?? "stable",
      focusTrend: snapshot.longitudinalSignals?.focusTrend ?? "stable",
      cycleDetected: snapshot.longitudinalSignals?.cycleDetected ?? false,
    },
    alignment: {
      alignedValues: snapshot.valueAlignmentSignals?.alignedValues ?? [],
      misalignedValues: snapshot.valueAlignmentSignals?.misalignedValues ?? [],
    },
    friction: {
      recurringLoops: [],
      distortions: [],
      contradictions: snapshot.contradictionDetected,
    },
    trajectory: {
      connectionDepth: 0,
      progressIndex: 0,
    },
  };
}
