/**
 * Build structured input for suggestWeeklyFocusItems from governance reads only.
 * Server-only. No user text. No LLM.
 */

import {
  getGovernanceStateForUser,
  getRecentViolationCounts,
  getViolationAndCompletionCounts30d,
  getActiveCommitmentsMetadata,
  getFocusSessionsCountLast7d,
  getPriorViolationTrendSnapshot,
} from "@/lib/governance/readState";
import { buildBehaviourSnapshot } from "@/lib/governance/behaviourSnapshot";
import { getFocusSessionsCountLast30d } from "@/lib/governance/readState";
import type { SuggestWeeklyFocusInput } from "./focusEngine";

const NO_BOUNDARY = { boundaryTriggered: false };
const NO_CONTRADICTION = { contradictionDetected: false, contradictedCommitmentIds: [] as string[] };

/**
 * Collects governance + snapshot data and returns input for suggestWeeklyFocusItems.
 * activeValues optional (e.g. from query param); codes only, max 20.
 */
export async function buildFocusInputForUser(
  userId: string,
  activeValues?: string[] | null
): Promise<SuggestWeeklyFocusInput> {
  const [governance, violationCounts7d, violationCounts30d, commitments, focus7d, focus30d, priorTrend] =
    await Promise.all([
      getGovernanceStateForUser(userId),
      getRecentViolationCounts(userId),
      getViolationAndCompletionCounts30d(userId),
      getActiveCommitmentsMetadata(userId),
      getFocusSessionsCountLast7d(userId),
      getFocusSessionsCountLast30d(userId),
      getPriorViolationTrendSnapshot(userId),
    ]);

  const longitudinalInput = {
    violationCounts30d,
    completionCounts30d: { commitmentCompleted30d: violationCounts30d.commitmentCompleted30d },
    focusSessions30d: focus30d,
    priorTrendSnapshot: priorTrend,
  };

  const activeValuesClean =
    Array.isArray(activeValues) && activeValues.length <= 20
      ? activeValues.filter((v) => typeof v === "string" && /^[a-zA-Z0-9_-]+$/.test(v)).slice(0, 20)
      : undefined;

  const snapshot = buildBehaviourSnapshot(
    governance,
    violationCounts7d,
    focus7d,
    NO_CONTRADICTION,
    NO_BOUNDARY,
    longitudinalInput,
    activeValuesClean ?? null
  );

  return {
    governance: {
      riskScore: snapshot.riskScore,
      escalationLevel: snapshot.escalationLevel,
      recoveryState: snapshot.recoveryState,
      disciplineState: snapshot.disciplineState,
      focusState: snapshot.focusState,
    },
    violationCounts7d: {
      commitmentViolations: violationCounts7d.commitmentViolations,
      abstinenceViolations: violationCounts7d.abstinenceViolations,
      commitmentCompleted: violationCounts7d.commitmentCompleted,
    },
    violationCounts30d: {
      commitmentViolations30d: violationCounts30d.commitmentViolations30d,
      abstinenceViolations30d: violationCounts30d.abstinenceViolations30d,
      commitmentCompleted30d: violationCounts30d.commitmentCompleted30d,
    },
    contradictionDetected: snapshot.contradictionDetected,
    contradictedCommitmentIds: snapshot.contradictedCommitmentIds,
    boundarySeverity: snapshot.boundarySeverity ?? 0,
    guidanceSignals: snapshot.guidanceSignals,
    identitySignals: snapshot.identitySignals,
    longitudinalSignals: snapshot.longitudinalSignals,
    valueAlignmentSignals: snapshot.valueAlignmentSignals,
    activeCommitments: commitments,
    focusSessionsLast7d: focus7d,
    activeValues: activeValuesClean ?? undefined,
  };
}
