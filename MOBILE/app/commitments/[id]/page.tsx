"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Pause, Play, Check, X, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeCompletionDots, type DayDot } from "@/lib/execution/completionDots";
import { getCommitmentLocal, type CommitmentLocalDecrypted } from "@/lib/local/db/commitmentsLocalRepo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommitmentRow = {
  id: string;
  commitment_code: string;
  subject_code: string | null;
  target_type: string | null;
  target_value: number | null;
  status: string;
  start_at: string;
  created_at: string;
  updated_at: string;
};

type OutcomeEvent = {
  id: string;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

const DOMAIN_LABELS: Record<string, string> = {
  sleep: "Sleep",
  focus: "Focus",
  routine: "Routine",
  fitness: "Fitness",
  abstinence: "Abstinence",
  social: "Social",
  other: "Other",
};

const DOT_COLORS: Record<string, string> = {
  completed: "bg-emerald-500",
  skipped: "bg-amber-400",
  missed: "bg-red-400",
  none: "bg-neutral-200 dark:bg-neutral-700",
  future: "bg-neutral-100 dark:bg-neutral-800",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CommitmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const commitmentId = params.id as string;

  const [commitment, setCommitment] = useState<CommitmentRow | null>(null);
  const [localData, setLocalData] = useState<CommitmentLocalDecrypted | null>(null);
  const [events, setEvents] = useState<OutcomeEvent[]>([]);
  const [dots, setDots] = useState<DayDot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!commitmentId) return;
    setLoading(true);

    try {
      // Fetch commitment + outcomes in parallel
      const [commitmentRes, outcomesRes] = await Promise.all([
        fetch(`/api/commitments/list`),
        fetch(`/api/commitments/outcome?commitment_id=${commitmentId}&days=7`).catch(() => null),
      ]);

      if (commitmentRes.ok) {
        const data = await commitmentRes.json();
        const found = (data.commitments ?? []).find((c: CommitmentRow) => c.id === commitmentId);
        setCommitment(found ?? null);
      }

      // Outcomes — use the events if available, otherwise compute empty dots
      let outcomeEvents: OutcomeEvent[] = [];
      if (outcomesRes?.ok) {
        const outData = await outcomesRes.json();
        outcomeEvents = outData.events ?? [];
      }
      setEvents(outcomeEvents);
      setDots(computeCompletionDots(outcomeEvents));

      // Try to load local encrypted data
      try {
        const local = await getCommitmentLocal("local", commitmentId);
        setLocalData(local);
      } catch {
        // Local data missing is fine — UI works without it
      }
    } catch {
      // Error handled via null commitment
    } finally {
      setLoading(false);
    }
  }, [commitmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function logOutcome(outcomeCode: "completed" | "skipped") {
    if (!commitment || actionLoading) return;
    setActionLoading(true);

    try {
      const res = await fetch("/api/commitments/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitment_id: commitment.id,
          outcome_code: outcomeCode,
        }),
      });

      if (res.ok) {
        await fetchData(); // Refresh
      }
    } catch {
      // Silent fail
    } finally {
      setActionLoading(false);
    }
  }

  async function changeStatus(newStatus: "paused" | "active" | "abandoned") {
    if (!commitment || actionLoading) return;
    setActionLoading(true);

    try {
      const res = await fetch("/api/commitments/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitment_id: commitment.id,
          new_status: newStatus,
        }),
      });

      if (res.ok) {
        if (newStatus === "abandoned") {
          router.push("/commitments");
        } else {
          await fetchData();
        }
      }
    } catch {
      // Silent fail
    } finally {
      setActionLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-vella-muted/30 border-t-[var(--vella-primary)] rounded-full animate-spin" />
      </div>
    );
  }

  if (!commitment) {
    return (
      <div className="px-5 py-6 space-y-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1 -ml-1 pressable"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-vella-text" strokeWidth={1.8} />
        </button>
        <p className="text-sm text-vella-muted">Commitment not found.</p>
      </div>
    );
  }

  const isActive = commitment.status === "active";
  const isPaused = commitment.status === "paused";

  // Check if already completed today
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayDot = dots.find((d) => d.date === todayKey);
  const completedToday = todayDot?.state === "completed";

  return (
    <div className="px-5 py-6 space-y-6">
      {/* Header */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1 -ml-1 pressable"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-vella-text" strokeWidth={1.8} />
        </button>
        <h1 className="text-xl font-semibold text-vella-text">Commitment</h1>
      </header>

      {/* Main card */}
      <div className="rounded-[var(--vella-radius-card)] border border-vella-border bg-vella-bg-card p-5 space-y-4">
        {/* Domain + Status */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--vella-primary)] bg-[var(--vella-primary-muted)] px-2 py-0.5 rounded-full">
            {DOMAIN_LABELS[commitment.subject_code ?? "other"] ?? "Other"}
          </span>
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            isActive
              ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30"
              : isPaused
              ? "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30"
              : "text-vella-muted bg-neutral-100 dark:bg-neutral-800"
          )}>
            {isActive ? "Active" : isPaused ? "Paused" : commitment.status}
          </span>
        </div>

        {/* Description (from local or fallback) */}
        <div>
          {localData?.description ? (
            <p className="text-base font-medium text-vella-text">{localData.description}</p>
          ) : (
            <p className="text-base font-medium text-vella-text">
              {commitment.commitment_code.replace(/_/g, " ")}
            </p>
          )}
          {localData?.motivation && (
            <p className="text-sm text-vella-muted mt-1">{localData.motivation}</p>
          )}
        </div>

        {/* Target info */}
        {commitment.target_value != null && commitment.target_type && (
          <p className="text-sm text-vella-muted">
            Target: {commitment.target_value} ({commitment.target_type})
          </p>
        )}

        {/* 7-day dots */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-vella-muted uppercase tracking-wide">Last 7 days</p>
          <div className="flex items-center gap-2.5">
            {dots.map((dot) => (
              <div key={dot.date} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "w-5 h-5 rounded-full transition-colors",
                    DOT_COLORS[dot.state] ?? DOT_COLORS.none
                  )}
                  title={`${dot.dayLabel}: ${dot.state}`}
                />
                <span className="text-[10px] text-vella-muted leading-none">{dot.dayLabel}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[10px] text-vella-muted">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Done
            </span>
            <span className="flex items-center gap-1 text-[10px] text-vella-muted">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Skipped
            </span>
            <span className="flex items-center gap-1 text-[10px] text-vella-muted">
              <span className="w-2 h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 inline-block" /> No data
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {(isActive || isPaused) && (
        <div className="space-y-3">
          {/* Primary actions (only when active) */}
          {isActive && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => logOutcome("completed")}
                disabled={actionLoading || completedToday}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-[var(--vella-radius-button)] py-3 text-sm font-semibold pressable transition-opacity",
                  completedToday
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 cursor-default"
                    : "bg-[var(--vella-primary)] text-white",
                  actionLoading && "opacity-60 cursor-not-allowed"
                )}
              >
                <Check className="w-4 h-4" strokeWidth={2.2} />
                {completedToday ? "Completed today" : "Complete"}
              </button>
              {!completedToday && (
                <button
                  type="button"
                  onClick={() => logOutcome("skipped")}
                  disabled={actionLoading}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-[var(--vella-radius-button)] border border-vella-border bg-vella-bg-card px-5 py-3 text-sm font-medium text-vella-text pressable transition-opacity",
                    actionLoading && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                  Skip
                </button>
              )}
            </div>
          )}

          {/* Secondary actions */}
          <div className="flex gap-3">
            {isActive && (
              <button
                type="button"
                onClick={() => changeStatus("paused")}
                disabled={actionLoading}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-[var(--vella-radius-button)] border border-vella-border bg-vella-bg-card py-2.5 text-sm font-medium text-vella-text pressable transition-opacity",
                  actionLoading && "opacity-60"
                )}
              >
                <Pause className="w-3.5 h-3.5" strokeWidth={2} />
                Pause
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                onClick={() => changeStatus("active")}
                disabled={actionLoading}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-[var(--vella-radius-button)] bg-[var(--vella-primary)] py-2.5 text-sm font-semibold text-white pressable transition-opacity",
                  actionLoading && "opacity-60"
                )}
              >
                <Play className="w-3.5 h-3.5" strokeWidth={2} />
                Resume
              </button>
            )}
            <button
              type="button"
              onClick={() => changeStatus("abandoned")}
              disabled={actionLoading}
              className={cn(
                "flex items-center justify-center gap-2 rounded-[var(--vella-radius-button)] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm font-medium text-red-700 dark:text-red-300 pressable transition-opacity",
                actionLoading && "opacity-60"
              )}
            >
              <Archive className="w-3.5 h-3.5" strokeWidth={2} />
              Archive
            </button>
          </div>
        </div>
      )}

      {/* Outcome history */}
      {events.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-vella-text">Recent outcomes</h2>
          <div className="space-y-2">
            {events.slice(0, 10).map((event) => {
              const meta = event.metadata as Record<string, unknown> | null;
              const outcome = (meta?.outcome_code as string) ?? "unknown";
              const date = new Date(event.occurred_at);
              const dateStr = date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeStr = date.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-[var(--vella-radius-button)] border border-vella-border bg-vella-bg-card px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "w-2.5 h-2.5 rounded-full",
                        outcome === "completed"
                          ? "bg-emerald-500"
                          : outcome === "skipped"
                          ? "bg-amber-400"
                          : "bg-red-400"
                      )}
                    />
                    <span className="text-sm font-medium text-vella-text capitalize">{outcome}</span>
                  </div>
                  <span className="text-xs text-vella-muted">
                    {dateStr} · {timeStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
