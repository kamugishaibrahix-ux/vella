"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Zap, Target, RefreshCw, ChevronRight, X } from "lucide-react";

/** Replace with real API response when wired. */
const snapshot = {
  recovery: {
    score: 78,
    delta: 6,
    basis: "6 check-ins · 1 violation",
  },
  discipline: {
    score: 54,
    delta: -8,
    basis: "2 missed commitments",
  },
  focus: {
    score: 82,
    delta: 4,
    basis: "5 focus sessions",
  },
  trends: {
    recovery: "up",
    discipline: "down",
    focus: "up",
  },
  cycle: {
    detected: true,
    description: "Overfocus → Exhaustion → Discipline drop",
    lastDetected: "3 days ago",
  },
  friction: [
    { label: "Sleep", count: 3 },
    { label: "Health", count: 1 },
  ],
  alignment: [
    { label: "Growth", direction: "up" as const },
    { label: "Health", direction: "up" as const },
  ],
  trajectory: {
    connectionDepth: 76,
    connectionDelta: 4,
    progress: 64,
    progressDelta: 3,
  },
};

const DURATION_MS = 600;

function animateValue(
  from: number,
  to: number,
  durationMs: number,
  onUpdate: (n: number) => void
) {
  const start = performance.now();
  function tick(now: number) {
    const elapsed = now - start;
    const t = Math.min(elapsed / durationMs, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const value = Math.round(from + (to - from) * eased);
    onUpdate(value);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function ConditionCard({
  icon: Icon,
  label,
  score,
  delta,
  basis,
  iconClassName,
}: {
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  label: string;
  score: number;
  delta: number;
  basis: string;
  iconClassName?: string;
}) {
  const [displayScore, setDisplayScore] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    animateValue(0, score, DURATION_MS, setDisplayScore);
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min((now - start) / DURATION_MS, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setBarWidth(score * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [score]);

  const deltaArrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const deltaLabel = delta > 0 ? `+${delta}` : delta === 0 ? "0" : String(delta);

  return (
    <div className="rounded-2xl border border-vella-border/60 bg-vella-bg-card p-4 text-center shadow-sm">
      <div className="flex justify-center">
        <Icon className={iconClassName ?? "text-vella-muted"} size={20} strokeWidth={1.8} />
      </div>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-vella-muted">{label}</p>
      <div className="mt-1 flex items-baseline justify-center gap-0.5">
        <span className="text-2xl font-semibold tabular-nums text-vella-text">{displayScore}</span>
        <span className="text-sm text-vella-muted">/100</span>
      </div>
      <p className="mt-0.5 text-xs text-vella-muted">
        <span aria-hidden>{deltaArrow}</span> {deltaLabel} this week
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-vella-border/60">
        <div
          className="h-full rounded-full bg-vella-accent-muted transition-none"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-vella-muted">Based on: {basis}</p>
    </div>
  );
}

function trendLabel(t: string) {
  return t === "up" ? "Improving" : t === "down" ? "Declining" : "Stable";
}

function trendArrow(t: string) {
  return t === "up" ? "↑" : t === "down" ? "↓" : "→";
}

function MicroSparkline({ trend }: { trend: string }) {
  const heights = [0.4, 0.6, 0.5, 0.7, 0.45, 0.65, 0.55];
  const [opacity, setOpacity] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <div
      className="flex items-end gap-0.5 h-4"
      style={{ opacity, transition: "opacity 0.4s ease-out" }}
      aria-hidden
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-0.5 rounded-full bg-vella-muted/60 min-h-[2px]"
          style={{ height: `${h * 100}%` }}
        />
      ))}
    </div>
  );
}

function DirectionRow({
  label,
  trend,
}: {
  label: string;
  trend: "up" | "down" | "stable";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-vella-muted shrink-0">{label}</span>
      <MicroSparkline trend={trend} />
      <span className="flex items-center gap-1 text-sm font-medium text-vella-text shrink-0">
        <span className="text-vella-muted" aria-hidden>{trendArrow(trend)}</span>
        {trendLabel(trend)}
      </span>
    </div>
  );
}

function CycleBottomSheet({
  open,
  onClose,
  title,
  description,
  cycleFlow,
  lastDetected,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  cycleFlow: string;
  lastDetected: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-black/40 animate-fadeIn"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[70dvh] overflow-auto rounded-t-2xl border border-vella-border border-b-0 bg-vella-bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.06)] animate-sheet-rise"
      >
        <div className="sticky top-0 flex justify-end p-2 border-b border-vella-border bg-vella-bg-card">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-vella-muted hover:text-vella-text pressable"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 pb-8 pt-2">
          <h2 className="text-lg font-semibold text-vella-text">{title}</h2>
          <p className="mt-2 text-sm text-vella-muted leading-relaxed">{description}</p>
          <p className="mt-3 text-sm font-medium text-vella-text">{cycleFlow}</p>
          <p className="mt-2 text-xs text-vella-muted">Last detected: {lastDetected}</p>
        </div>
      </div>
    </>
  );
}

function FrictionModal({
  open,
  onClose,
  label,
  count,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  count: number;
}) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${label} friction`}
        className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-vella-border bg-vella-bg-card p-5 shadow-vella-hover"
      >
        <p className="text-sm text-vella-text">
          {count} signal{count !== 1 ? "s" : ""} this week contributing to tension.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-vella-button border border-vella-border bg-vella-bg py-2 text-sm font-medium text-vella-text pressable"
        >
          Close
        </button>
      </div>
    </>
  );
}

export default function InsightsPage() {
  const [cycleSheetOpen, setCycleSheetOpen] = useState(false);
  const [frictionModal, setFrictionModal] = useState<{ label: string; count: number } | null>(null);

  const [connDisplay, setConnDisplay] = useState(0);
  const [connDeltaDisplay, setConnDeltaDisplay] = useState(0);
  const [progressDisplay, setProgressDisplay] = useState(0);
  const [progressDeltaDisplay, setProgressDeltaDisplay] = useState(0);
  const trajMounted = useRef(false);

  useEffect(() => {
    if (trajMounted.current) return;
    trajMounted.current = true;
    animateValue(0, snapshot.trajectory.connectionDepth, DURATION_MS, setConnDisplay);
    animateValue(0, snapshot.trajectory.connectionDelta, DURATION_MS, setConnDeltaDisplay);
    animateValue(0, snapshot.trajectory.progress, DURATION_MS, setProgressDisplay);
    animateValue(0, snapshot.trajectory.progressDelta, DURATION_MS, setProgressDeltaDisplay);
  }, []);

  return (
    <div className="px-5 py-6 space-y-6">
      {/* Header — no bell icon */}
      <header>
        <h1 className="text-xl font-semibold text-vella-text">Insights</h1>
      </header>

      <p className="text-sm text-vella-muted">Your current condition</p>

      {/* Section 1 — Condition cards (quantified) */}
      <div className="grid grid-cols-3 gap-4">
        <ConditionCard
          icon={Heart}
          label="Recovery"
          score={snapshot.recovery.score}
          delta={snapshot.recovery.delta}
          basis={snapshot.recovery.basis}
          iconClassName="text-vella-accent-muted"
        />
        <ConditionCard
          icon={Zap}
          label="Discipline"
          score={snapshot.discipline.score}
          delta={snapshot.discipline.delta}
          basis={snapshot.discipline.basis}
          iconClassName="text-vella-muted-strong"
        />
        <ConditionCard
          icon={Target}
          label="Focus"
          score={snapshot.focus.score}
          delta={snapshot.focus.delta}
          basis={snapshot.focus.basis}
          iconClassName="text-vella-accent-muted"
        />
      </div>

      <hr className="border-t border-neutral-200 my-6" />

      {/* Section 2 — Direction (↑ ↓ → + sparklines) */}
      <section>
        <h2 className="text-base font-semibold text-vella-text mb-3">Direction</h2>
        <div className="space-y-3">
          <DirectionRow label="Discipline trend" trend={snapshot.trends.discipline as "up" | "down" | "stable"} />
          <DirectionRow label="Focus trend" trend={snapshot.trends.focus as "up" | "down" | "stable"} />
          <DirectionRow label="Recovery trend" trend={snapshot.trends.recovery as "up" | "down" | "stable"} />
        </div>
      </section>

      {/* Section 3 — Behaviour cycle (opens bottom sheet on tap) */}
      {snapshot.cycle.detected && (
        <button
          type="button"
          className="w-full rounded-2xl border border-vella-border/60 bg-vella-bg-card p-4 shadow-sm flex items-center justify-between text-left pressable"
          onClick={() => setCycleSheetOpen(true)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <RefreshCw
              className="shrink-0 text-vella-accent-muted"
              size={22}
              strokeWidth={1.8}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-medium text-vella-text">Behaviour cycle detected</p>
              <p className="text-sm text-vella-muted">Recurring patterns emerging</p>
            </div>
          </div>
          <ChevronRight className="shrink-0 w-5 h-5 text-vella-muted" aria-hidden />
        </button>
      )}

      <CycleBottomSheet
        open={cycleSheetOpen}
        onClose={() => setCycleSheetOpen(false)}
        title="Behaviour cycle detected"
        description="A repeating pattern in your behaviour is affecting your discipline and focus."
        cycleFlow={snapshot.cycle.description}
        lastDetected={snapshot.cycle.lastDetected}
      />

      {/* Section 4 — Friction (with count) + Value alignment */}
      <div className="grid grid-cols-2 gap-6">
        <section>
          <h2 className="text-base font-semibold text-vella-text">Friction</h2>
          <p className="text-xs text-vella-muted mt-0.5">Misaligned values</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {snapshot.friction.map(({ label, count }) => (
              <button
                key={label}
                type="button"
                className="rounded-full border border-vella-border bg-vella-bg-card px-3 py-1 text-sm font-medium text-vella-muted-strong pressable"
                onClick={() => setFrictionModal({ label, count })}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2 className="text-base font-semibold text-vella-text">Value alignment</h2>
          <p className="text-xs text-vella-muted mt-0.5">Reinforced values</p>
          <ul className="mt-2 space-y-1.5 text-sm text-vella-text">
            {snapshot.alignment.map(({ label, direction }) => (
              <li key={label} className="flex items-center gap-1">
                <span>{label}</span>
                <span className="text-vella-muted" aria-hidden>{direction === "up" ? "↑" : direction === "down" ? "↓" : "→"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {frictionModal && (
        <FrictionModal
          open={!!frictionModal}
          onClose={() => setFrictionModal(null)}
          label={frictionModal.label}
          count={frictionModal.count}
        />
      )}

      {/* Section 5 — Trajectory (quantified, animated) */}
      <section>
        <h2 className="text-base font-semibold text-vella-text mb-3">Trajectory</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-vella-muted">Connection depth</span>
            <span className="flex items-center gap-1 font-medium text-vella-text tabular-nums">
              {connDisplay}%
              <span className="text-vella-muted text-xs">
                {snapshot.trajectory.connectionDelta >= 0 ? "↑" : "↓"}{" "}
                {snapshot.trajectory.connectionDelta >= 0 ? "+" : ""}{connDeltaDisplay}%
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-vella-muted">Progress level</span>
            <span className="flex items-center gap-1 font-medium text-vella-text tabular-nums">
              {progressDisplay}%
              <span className="text-vella-muted text-xs">
                {snapshot.trajectory.progressDelta >= 0 ? "↑" : "↓"}{" "}
                {snapshot.trajectory.progressDelta >= 0 ? "+" : ""}{progressDeltaDisplay}%
              </span>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
