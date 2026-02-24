/**
 * GET /api/insights/snapshot
 * Deterministic behavioural snapshot for the Insights page.
 * No LLM. Read-only from governance_state, behavioural_state_current, behaviour_events, commitments.
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { rateLimit, isRateLimitError, rateLimit429Response } from "@/lib/security/rateLimit";
import { serverErrorResponse } from "@/lib/security/consistentErrors";
import { safeErrorLog } from "@/lib/security/logGuard";
import {
  getGovernanceStateForUser,
  getRecentViolationCounts,
  getViolationAndCompletionCounts30d,
  getActiveCommitmentsMetadata,
  getFocusSessionsCountLast7d,
  getFocusSessionsCountLast30d,
  getPriorViolationTrendSnapshot,
} from "@/lib/governance/readState";
import { buildBehaviourSnapshot } from "@/lib/governance/behaviourSnapshot";
import { fromSafe } from "@/lib/supabase/admin";

const READ_LIMIT = { limit: 60, window: 60 };

export type InsightsSnapshotResponse = {
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

function normalizeToStringArray(arr: unknown[]): string[] {
  return arr
    .filter((x) => x != null)
    .map((x) => {
      if (typeof x === "string") return x;
      if (typeof x === "object" && x !== null && "loop" in x && typeof (x as { loop: unknown }).loop === "string")
        return (x as { loop: string }).loop;
      if (typeof x === "object" && x !== null && "type" in x && typeof (x as { type: unknown }).type === "string")
        return (x as { type: string }).type;
      if (typeof x === "object" && x !== null && "name" in x && typeof (x as { name: unknown }).name === "string")
        return (x as { name: string }).name;
      return String(x);
    })
    .filter(Boolean);
}

function progressToIndex(progress: Record<string, unknown>): number {
  if (typeof progress.index === "number" && progress.index >= 0 && progress.index <= 10) return progress.index;
  const keys = Object.keys(progress).filter((k) => k !== "index");
  if (keys.length === 0) return 0;
  return Math.min(10, Math.floor(keys.length));
}

export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    await rateLimit({
      key: `read:insights_snapshot:${userId}`,
      limit: READ_LIMIT.limit,
      window: READ_LIMIT.window,
    });
  } catch (err: unknown) {
    if (isRateLimitError(err)) return rateLimit429Response(err.retryAfterSeconds);
    throw err;
  }

  try {
    const [
      governance,
      violationCounts7d,
      violationCounts30d,
      commitments,
      focus7d,
      focus30d,
      priorTrend,
      stateRow,
    ] = await Promise.all([
      getGovernanceStateForUser(userId),
      getRecentViolationCounts(userId),
      getViolationAndCompletionCounts30d(userId),
      getActiveCommitmentsMetadata(userId),
      getFocusSessionsCountLast7d(userId),
      getFocusSessionsCountLast30d(userId),
      getPriorViolationTrendSnapshot(userId),
      fromSafe("behavioural_state_current").select("state_json").eq("user_id", userId).maybeSingle(),
    ]);

    const state = (stateRow.data as { state_json?: Record<string, unknown> } | null)?.state_json ?? {};
    const longitudinalInput = {
      violationCounts30d,
      completionCounts30d: { commitmentCompleted30d: violationCounts30d.commitmentCompleted30d },
      focusSessions30d: focus30d,
      priorTrendSnapshot: priorTrend,
    };
    const activeValues = Array.from(
      new Set(
        commitments
          .map((c) => c.subject_code)
          .filter((s): s is string => typeof s === "string" && /^[a-zA-Z0-9_-]+$/.test(s))
      )
    ).slice(0, 20);

    const snapshot = buildBehaviourSnapshot(
      governance,
      {
        commitmentViolations: violationCounts7d.commitmentViolations,
        abstinenceViolations: violationCounts7d.abstinenceViolations,
        commitmentCompleted: violationCounts7d.commitmentCompleted,
      },
      focus7d,
      { contradictionDetected: false, contradictedCommitmentIds: [] },
      { boundaryTriggered: false },
      longitudinalInput,
      activeValues.length > 0 ? activeValues : null
    );

    const loopsRaw = Array.isArray(state.loops) ? state.loops : [];
    const distortionsRaw = Array.isArray(state.distortions) ? state.distortions : [];
    const progress = (state.progress && typeof state.progress === "object" ? state.progress : {}) as Record<string, unknown>;
    const connectionDepth = typeof state.connection_depth === "number" ? state.connection_depth : 0;

    const body: InsightsSnapshotResponse = {
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
        recurringLoops: normalizeToStringArray(loopsRaw),
        distortions: normalizeToStringArray(distortionsRaw),
        contradictions: snapshot.contradictionDetected,
      },
      trajectory: {
        connectionDepth,
        progressIndex: progressToIndex(progress),
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    safeErrorLog("[api/insights/snapshot] error", error);
    return serverErrorResponse();
  }
}
