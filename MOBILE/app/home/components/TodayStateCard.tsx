"use client";

import { useMemo } from "react";
import type { HomeState } from "@/lib/home/deriveHomeState";
import { computeStateLabel, type StateLabelResult } from "@/lib/home/stateLabel";

// ---------------------------------------------------------------------------
// Label colour mapping
// ---------------------------------------------------------------------------

const LABEL_COLORS: Record<string, string> = {
  Stable: "var(--vella-primary)",
  Building: "#6b8f6e",
  Drifting: "#b08d57",
  "Under Load": "#c2675a",
  Rebuilding: "#7a8fb5",
  Starting: "var(--vella-muted)",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TodayStateCard({ state }: { state: HomeState | null }) {
  const result: StateLabelResult | null = useMemo(() => {
    if (!state) return null;
    return computeStateLabel({
      consistency: state.consistency,
      stability: state.stability,
      improvement: state.improvement,
      missedWindows: state.missedCount,
      unreadInbox: state.unreadCount,
      activeCommitments: state.activeCommitmentCount,
      triggersUsed: state.triggerUsage.used,
      triggersCap: state.triggerUsage.cap,
      streakDays: state.streakDays,
    });
  }, [state]);

  // Loading skeleton
  if (!result) {
    return (
      <div className="rounded-vella-card bg-vella-bg-card p-5 animate-pulse" style={{ minHeight: 120 }}>
        <div className="h-4 w-24 rounded bg-vella-border mb-3" />
        <div className="h-3 w-40 rounded bg-vella-border" />
      </div>
    );
  }

  const labelColor = LABEL_COLORS[result.label] ?? "var(--vella-muted)";

  return (
    <section className="rounded-vella-card bg-vella-bg-card p-5" style={{ boxShadow: "var(--vella-elevation)" }}>
      {/* Section title */}
      <p className="text-xs font-semibold tracking-wide uppercase text-vella-muted mb-3">
        Today&rsquo;s State
      </p>

      {/* State label */}
      <p className="text-lg font-bold mb-3" style={{ color: labelColor }}>
        {result.label}
      </p>

      {/* Chips */}
      <div className="flex gap-2 flex-wrap mb-4">
        {result.chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-vella-pill text-xs font-medium"
            style={{
              background: "var(--vella-primary-muted)",
              color: "var(--vella-text)",
            }}
          >
            <span className="text-vella-muted">{chip.label}:</span>
            <span className="font-semibold">{chip.value}</span>
          </span>
        ))}
      </div>

      {/* Suggestion */}
      <p className="text-sm text-vella-muted leading-relaxed">
        {result.suggestion}
      </p>
    </section>
  );
}
