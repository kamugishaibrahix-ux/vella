"use client";

import { EngagementChart } from "./EngagementChart";
import type { EngagementData } from "@/lib/api/adminEngagementClient";

type EngagementPanelProps = {
  engagement: EngagementData | null;
  engagementError: string | null;
};

export function EngagementPanel({ engagement, engagementError }: EngagementPanelProps) {
  const chartData = engagement?.chart ?? [];
  const summary = engagement?.summary;

  // Calculate last 7 days for display
  const last7Days = chartData.slice(-7);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-[rgb(var(--card-bg)/0.4)] p-8 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-px rounded-[1.7rem] bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.25),transparent_55%),radial-gradient(circle_at_bottom,_rgba(45,212,191,0.12),transparent_55%)]" />
      <div className="relative z-10 space-y-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Engagement Snapshot</h2>
            <p className="text-sm text-slate-300">
              Rolling sessions across text + voice modes
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200">
            30-day view
          </span>
        </header>

        {engagementError ? (
          <div className="py-12 text-center text-sm text-destructive">
            Failed to load engagement data
          </div>
        ) : (
          <>
            <EngagementChart data={last7Days} />

            <ul className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
              <li>• Total tokens: {summary?.total_tokens ? formatCompactNumber(summary.total_tokens) : "—"}</li>
              <li>• Total feedback: {summary?.total_feedback ? summary.total_feedback.toLocaleString() : "—"}</li>
              <li>• Estimated sessions: {summary?.estimated_sessions ? summary.estimated_sessions.toLocaleString() : "—"}</li>
              <li>• Average per day: {last7Days.length > 0 ? Math.round(last7Days.reduce((sum, d) => sum + d.sessions, 0) / last7Days.length).toLocaleString() : "—"}</li>
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}


