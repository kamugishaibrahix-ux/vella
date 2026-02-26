"use client";

import Link from "next/link";
import type { HomeState } from "@/lib/home/deriveHomeState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function commitmentLabel(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeekFocusCard({ state }: { state: HomeState | null }) {
  if (!state) {
    return (
      <div className="rounded-vella-card bg-vella-bg-card p-5 animate-pulse" style={{ minHeight: 80 }}>
        <div className="h-4 w-28 rounded bg-vella-border mb-3" />
        <div className="h-3 w-36 rounded bg-vella-border" />
      </div>
    );
  }

  const active = state.commitments.filter((c) => c.status === "active");

  // Pick top 2 commitments deterministically:
  // Sort by most recently created, then take top 2
  const focus = [...active]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 2);

  // No commitments — gentle nudge
  if (active.length === 0) {
    return (
      <section className="rounded-vella-card bg-vella-bg-card p-5" style={{ boxShadow: "var(--vella-elevation)" }}>
        <p className="text-xs font-semibold tracking-wide uppercase text-vella-muted mb-3">
          This Week
        </p>
        <p className="text-sm text-vella-muted mb-3">
          No commitments yet.
        </p>
        <Link
          href={"/commitments" as "/commitments"}
          className="text-xs font-semibold pressable transition"
          style={{ color: "var(--vella-primary)" }}
        >
          Set a direction →
        </Link>
      </section>
    );
  }

  const triggerLine =
    state.triggerEngineOn && state.triggerUsage.cap > 0
      ? `Daily limit: ${state.triggerUsage.used} / ${state.triggerUsage.cap}`
      : null;

  return (
    <section className="rounded-vella-card bg-vella-bg-card p-5" style={{ boxShadow: "var(--vella-elevation)" }}>
      <p className="text-xs font-semibold tracking-wide uppercase text-vella-muted mb-3">
        This Week
      </p>

      {/* Focus commitments */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-vella-muted mb-2">
        Focus of the week
      </p>
      {focus.map((c) => (
        <div key={c.id} className="flex items-center gap-2 mb-1.5">
          <span
            className="shrink-0 inline-block px-2 py-0.5 rounded-vella-pill text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: "var(--vella-primary-muted)", color: "var(--vella-primary)" }}
          >
            {capitalize(c.subject_code)}
          </span>
          <span className="text-sm font-medium text-vella-text truncate">
            {commitmentLabel(c.commitment_code)}
          </span>
        </div>
      ))}

      {/* Operational summary */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-vella-muted">
        {state.windowsAheadToday > 0 && (
          <span>
            Windows today: <span className="font-semibold text-vella-text">{state.windowsAheadToday}</span>
          </span>
        )}
        {triggerLine && (
          <span>
            {triggerLine.split(": ")[0]}:{" "}
            <span className="font-semibold text-vella-text">{triggerLine.split(": ")[1]}</span>
          </span>
        )}
        {state.streakDays > 0 && (
          <span>
            Streak: <span className="font-semibold text-vella-text">{state.streakDays}d</span>
          </span>
        )}
      </div>
    </section>
  );
}
