"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { Activity, AlertCircle, TrendingUp, Target, Zap } from "lucide-react";
import supabase from "@/lib/supabase/client";
import { computeLocalInsightsSnapshot, type LocalInsightsSnapshotResponse } from "@/lib/governance/localInsights";

type AuthStatus = "unknown" | "authed" | "local";

// Matches GET /api/insights/snapshot response
interface InsightsSnapshotResponse {
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
}

const fetcher = async (url: string): Promise<InsightsSnapshotResponse> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const err = new Error(res.status === 401 ? "Unauthorized" : "Failed to load insights");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
};

function InsightsLoading() {
  return (
    <div className="flex-1 min-h-0 bg-vella-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-vella-muted">
        <Activity className="w-8 h-8 animate-pulse" />
        <p className="text-sm">Loading insights…</p>
      </div>
    </div>
  );
}

function InsightsError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex-1 min-h-0 bg-vella-bg flex items-center justify-center px-5">
      <div className="rounded-2xl bg-vella-bg-card border border-vella-border p-6 max-w-sm text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-vella-text mb-1">Unable to load insights</h2>
        <p className="text-sm text-vella-muted mb-4">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-vella-primary text-white text-sm font-medium pressable"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function InsightsEmpty() {
  return (
    <div className="flex-1 min-h-0 bg-vella-bg flex items-center justify-center px-5">
      <div className="rounded-2xl bg-vella-bg-card border border-vella-border p-6 max-w-sm text-center">
        <Target className="w-10 h-10 text-vella-muted mx-auto mb-3" />
        <h2 className="text-base font-semibold text-vella-text mb-1">No insights yet</h2>
        <p className="text-sm text-vella-muted">
          Complete check-ins and contracts to see your behavioural snapshot here.
        </p>
      </div>
    </div>
  );
}

export default function ClarityPage() {
  // ── Auth state machine ──────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState<AuthStatus>("unknown");

  useEffect(() => {
    if (!supabase) {
      if (process.env.NODE_ENV === "development") console.debug("[insights] authStatus → local (no supabase client)");
      setAuthStatus("local");
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const next: AuthStatus = data.session?.user?.id ? "authed" : "local";
      if (process.env.NODE_ENV === "development") console.debug("[insights] authStatus →", next);
      setAuthStatus(next);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const next: AuthStatus = session?.user?.id ? "authed" : "local";
      if (process.env.NODE_ENV === "development") console.debug("[insights] authStatus →", next, "(auth change)");
      setAuthStatus(next);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isLocalMode = authStatus !== "authed";

  // ── Server mode: fetch via SWR ──────────────────────────────────────
  const { data: serverData, error: serverError, isLoading: serverLoading, mutate } = useSWR<InsightsSnapshotResponse>(
    authStatus === "authed" ? "/api/insights/snapshot" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // ── Local mode: compute from IndexedDB + localStorage ───────────────
  const [localSnapshot, setLocalSnapshot] = useState<LocalInsightsSnapshotResponse | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const runLocalCompute = useCallback(() => {
    setLocalLoading(true);
    computeLocalInsightsSnapshot()
      .then((result) => { setLocalSnapshot(result); setLocalError(null); })
      .catch((err) => { setLocalError(err instanceof Error ? err.message : "Failed to compute local insights"); })
      .finally(() => setLocalLoading(false));
  }, []);

  useEffect(() => {
    if (authStatus === "local") runLocalCompute();
  }, [authStatus, runLocalCompute]);

  // ── Unified data selectors ──────────────────────────────────────────
  if (authStatus === "unknown") return <InsightsLoading />;

  const isLoading = isLocalMode ? localLoading : serverLoading;
  const error = isLocalMode ? localError : serverError;
  const data = isLocalMode ? localSnapshot : serverData;

  const isEmptyLocal =
    isLocalMode &&
    data != null &&
    data.condition.risk === 0 &&
    data.condition.escalation === 0 &&
    data.friction.recurringLoops.length === 0 &&
    data.alignment.alignedValues.length === 0 &&
    data.alignment.misalignedValues.length === 0;

  if (isLoading) return <InsightsLoading />;
  if (!isLocalMode && error) {
    const message = serverError instanceof Error ? serverError.message : "Something went wrong";
    return <InsightsError message={message} onRetry={() => mutate()} />;
  }
  if (!data) return <InsightsEmpty />;

  if (isEmptyLocal) {
    return (
      <div className="flex-1 min-h-0 bg-vella-bg flex items-center justify-center px-5">
        <div className="flex flex-col items-center justify-center text-center px-6 py-20">
          <div className="max-w-md">
            <h2 className="text-xl font-semibold text-vella-text mb-3">
              Your clarity builds with use
            </h2>
            <p className="text-sm text-vella-muted">
              As you check in, reflect, and complete sessions,
              Vella will begin surfacing deeper behavioural insights here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { condition, direction, alignment, friction, trajectory } = data;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-vella-bg">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hidden pb-24">
      <div className="px-5 py-6 space-y-5">
        <header>
          <h1 className="text-xl font-semibold text-vella-text">Clarity</h1>
          <p className="text-sm text-vella-muted mt-0.5">Behavioural snapshot from your data</p>
        </header>

        {/* Condition */}
        <section className="rounded-2xl bg-vella-bg-card border border-vella-border/60 p-4">
          <h2 className="text-xs font-medium text-vella-muted uppercase tracking-wide mb-3">Condition</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-vella-muted">Recovery</span>
              <p className="font-medium text-vella-text capitalize">{condition.recovery}</p>
            </div>
            <div>
              <span className="text-vella-muted">Discipline</span>
              <p className="font-medium text-vella-text capitalize">{condition.discipline}</p>
            </div>
            <div>
              <span className="text-vella-muted">Focus</span>
              <p className="font-medium text-vella-text capitalize">{condition.focus}</p>
            </div>
            <div>
              <span className="text-vella-muted">Risk</span>
              <p className="font-medium text-vella-text tabular-nums">{condition.risk}</p>
            </div>
          </div>
        </section>

        {/* Direction */}
        <section className="rounded-2xl bg-vella-bg-card border border-vella-border/60 p-4">
          <h2 className="text-xs font-medium text-vella-muted uppercase tracking-wide mb-3 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Direction
          </h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-vella-muted">Recovery trend</span>
              <span className="text-vella-text capitalize">{direction.recoveryTrend}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-vella-muted">Discipline trend</span>
              <span className="text-vella-text capitalize">{direction.disciplineTrend}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-vella-muted">Focus trend</span>
              <span className="text-vella-text capitalize">{direction.focusTrend}</span>
            </div>
            {direction.cycleDetected && (
              <p className="text-xs text-amber-600 pt-1">Pattern detected</p>
            )}
          </div>
        </section>

        {/* Alignment */}
        <section className="rounded-2xl bg-vella-bg-card border border-vella-border/60 p-4">
          <h2 className="text-xs font-medium text-vella-muted uppercase tracking-wide mb-3">Alignment</h2>
          <div className="space-y-2">
            {alignment.alignedValues.length > 0 && (
              <div>
                <p className="text-[10px] text-vella-muted uppercase mb-1">Aligned</p>
                <ul className="flex flex-wrap gap-1.5">
                  {alignment.alignedValues.map((v) => (
                    <li key={v} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs">
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {alignment.misalignedValues.length > 0 && (
              <div>
                <p className="text-[10px] text-vella-muted uppercase mb-1">Misaligned</p>
                <ul className="flex flex-wrap gap-1.5">
                  {alignment.misalignedValues.map((v) => (
                    <li key={v} className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs">
                      {v}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {alignment.alignedValues.length === 0 && alignment.misalignedValues.length === 0 && (
              <p className="text-sm text-vella-muted">No alignment data yet</p>
            )}
          </div>
        </section>

        {/* Friction */}
        <section className="rounded-2xl bg-vella-bg-card border border-vella-border/60 p-4">
          <h2 className="text-xs font-medium text-vella-muted uppercase tracking-wide mb-3 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" />
            Friction
          </h2>
          <div className="space-y-2 text-sm">
            {friction.recurringLoops.length > 0 && (
              <div>
                <p className="text-[10px] text-vella-muted uppercase mb-1">Recurring loops</p>
                <ul className="list-disc list-inside text-vella-text">
                  {friction.recurringLoops.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {friction.distortions.length > 0 && (
              <div>
                <p className="text-[10px] text-vella-muted uppercase mb-1">Distortions</p>
                <ul className="list-disc list-inside text-vella-text">
                  {friction.distortions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {friction.contradictions && (
              <p className="text-amber-600 text-xs">Contradictions detected</p>
            )}
            {friction.recurringLoops.length === 0 && friction.distortions.length === 0 && !friction.contradictions && (
              <p className="text-vella-muted">No friction signals</p>
            )}
          </div>
        </section>

        {/* Trajectory */}
        <section className="rounded-2xl bg-vella-bg-card border border-vella-border/60 p-4">
          <h2 className="text-xs font-medium text-vella-muted uppercase tracking-wide mb-3">Trajectory</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-vella-muted">Connection depth</span>
              <span className="font-medium text-vella-text tabular-nums">{trajectory.connectionDepth}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-vella-muted">Progress index</span>
              <span className="font-medium text-vella-text tabular-nums">{trajectory.progressIndex}</span>
            </div>
          </div>
        </section>
      </div>
      </div>
    </div>
  );
}
