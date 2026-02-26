"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { RefreshCw, ChevronRight, X, TrendingUp, TrendingDown, Activity, Clock, CheckCircle, FileText, Dumbbell } from "lucide-react";

// ============================================================================
// TYPES - Focus-Area-First Data Structure
// ============================================================================

type TimeContext = "today" | "7d" | "30d" | "year";
type FocusDomain = "self-mastery" | "addiction-recovery" | "relationships" | "emotional-regulation" | "decision-clarity" | "performance-focus" | "identity-direction";

interface FocusArea {
  domain: FocusDomain;
  addedAt: number;
}

interface FocusAreaPillar {
  domain: FocusDomain;
  label: string;
  score: number;
  delta: number;
  trend: "up" | "down" | "stable";
  sparkline: number[];
  drivenBy: string;
  breakdown: {
    checkins: number;
    focusBlocksCompleted: number;
    violations: number;
    contractsAdherence: number;
    contractsTotal: number;
    contractsCompleted: number;
    exercisesCompleted: number;
    exercisesTarget: number;
    timeframe: string;
  };
}

interface TodaySnapshot {
  contractsMissed: number;
  contractsTotal: number;
  focusBlocksCompleted: number;
  focusBlocksTotal: number;
  checkinsCompleted: number;
  checkinsExpected: number;
  exercisesCompleted: number;
  exercisesTarget: number;
  timeframe: string;
}

interface BehaviourMomentum {
  shifts: {
    label: string;
    direction: "improving" | "declining" | "stable";
    delta: number;
    source: string;
  }[];
  summary: string;
}

interface FocusAreaFriction {
  domain: FocusDomain;
  label: string;
  negativeSignal: string;
  count: number;
  evidence: string[];
}

interface FocusAreaAlignment {
  domain: FocusDomain;
  label: string;
  positiveSignal: string;
  streak: number;
}

interface CycleData {
  detected: boolean;
  name: string;
  description: string;
  detectedCount: number;
  timeframe: string;
  timelineMarkers: string[];
  patternSummary: string;
  suggestedExperiment: string;
  confidence: "Low" | "Medium" | "High";
  impactMetrics: { label: string; value: string }[];
}

interface TrajectoryData {
  connectionDepth: number;
  connectionDelta: number;
  progressLevel: number;
  progressDelta: number;
  growthPercentage: number;
  growthDelta: number;
  checkInConsistency: { current: number; target: number; percentage: number };
  timeframe: string;
}

interface ClarityData {
  pillars: FocusAreaPillar[];
  todaySnapshot: TodaySnapshot;
  behaviourMomentum: BehaviourMomentum;
  friction: FocusAreaFriction[];
  alignment: FocusAreaAlignment[];
  cycle: CycleData;
  trajectory: TrajectoryData;
  lastUpdated: string;
  dataSources: string[];
}

// ============================================================================
// DOMAIN METADATA
// ============================================================================

const DOMAIN_METADATA: Record<FocusDomain, { label: string; description: string }> = {
  "self-mastery": { label: "Self-Mastery", description: "Discipline, habits, personal control" },
  "addiction-recovery": { label: "Addiction Recovery", description: "Sobriety, urges, abstinence tracking" },
  "relationships": { label: "Relationships", description: "Family, romantic, social dynamics" },
  "emotional-regulation": { label: "Emotional Regulation", description: "Anxiety, anger, mood management" },
  "decision-clarity": { label: "Decision Clarity", description: "Choices, forks, uncertainty" },
  "performance-focus": { label: "Performance & Focus", description: "Work, flow, productivity" },
  "identity-direction": { label: "Identity & Direction", description: "Purpose, meaning, life path" },
};

// ============================================================================
// MOCK DATA GENERATION (Deterministic, derived from Focus Areas)
// ============================================================================

function generateDeterministicData(context: TimeContext): ClarityData {
  // Default focus areas if user hasn't set any
  const activeAreas: FocusArea[] = [
    { domain: "self-mastery", addedAt: Date.now() },
    { domain: "performance-focus", addedAt: Date.now() - 86400000 },
    { domain: "emotional-regulation", addedAt: Date.now() - 172800000 },
  ];

  // Generate sparklines for each area
  const generateSparkline = (base: number): number[] =>
    Array.from({ length: 7 }, (_, i) => Math.max(0.2, Math.min(0.95, base + (Math.sin(i * 0.8) * 0.2))));

  // Generate pillars from focus areas
  const pillars: FocusAreaPillar[] = activeAreas.map((area, index) => {
    const meta = DOMAIN_METADATA[area.domain];
    const baseScore = 70 - index * 10 + (context === "today" ? 5 : context === "7d" ? 0 : -5);
    const score = Math.round(Math.max(30, Math.min(95, baseScore + (Math.random() * 10 - 5))));
    const delta = context === "today" ? 2 : context === "7d" ? -3 : 5;

    return {
      domain: area.domain,
      label: meta.label,
      score,
      delta,
      trend: delta > 2 ? "up" : delta < -2 ? "down" : "stable",
      sparkline: generateSparkline(score / 100),
      drivenBy: index === 0 ? `${2 + index} contracts completed` : index === 1 ? `${1 + index} focus blocks done` : `${3 + index} check-ins logged`,
      breakdown: {
        checkins: 3 + index * 2,
        focusBlocksCompleted: 2 + index,
        violations: index === 1 ? 2 : 0,
        contractsAdherence: score,
        contractsTotal: 4 + index,
        contractsCompleted: 3 + index - (index === 1 ? 1 : 0),
        exercisesCompleted: 2 + index,
        exercisesTarget: 3,
        timeframe: context === "today" ? "Today" : context === "7d" ? "Last 7 days" : context === "30d" ? "Last 30 days" : "This year",
      },
    };
  });

  // Today Snapshot - strictly deterministic
  const todaySnapshot: TodaySnapshot = {
    contractsMissed: context === "today" ? 1 : context === "7d" ? 3 : 2,
    contractsTotal: context === "today" ? 4 : context === "7d" ? 12 : 8,
    focusBlocksCompleted: context === "today" ? 2 : 5,
    focusBlocksTotal: context === "today" ? 3 : 7,
    checkinsCompleted: context === "today" ? 2 : 5,
    checkinsExpected: context === "today" ? 3 : 7,
    exercisesCompleted: context === "today" ? 2 : 5,
    exercisesTarget: 3,
    timeframe: context === "today" ? "Today" : context === "7d" ? "Last 7 days" : context === "30d" ? "Last 30 days" : "This year",
  };

  // Behaviour Momentum - derived from snapshot
  const behaviourMomentum: BehaviourMomentum = {
    shifts: [
      {
        label: "Contract adherence",
        direction: todaySnapshot.contractsMissed === 0 ? "improving" : todaySnapshot.contractsMissed > 1 ? "declining" : "stable",
        delta: Math.round(((todaySnapshot.contractsTotal - todaySnapshot.contractsMissed) / Math.max(todaySnapshot.contractsTotal, 1)) * 100),
        source: "Contracts",
      },
      {
        label: "Check-in consistency",
        direction: todaySnapshot.checkinsCompleted >= todaySnapshot.checkinsExpected ? "improving" : "declining",
        delta: Math.round((todaySnapshot.checkinsCompleted / Math.max(todaySnapshot.checkinsExpected, 1)) * 100),
        source: "Check-ins",
      },
      {
        label: "Exercise completion",
        direction: todaySnapshot.exercisesCompleted >= todaySnapshot.exercisesTarget ? "improving" : "declining",
        delta: Math.round((todaySnapshot.exercisesCompleted / todaySnapshot.exercisesTarget) * 100),
        source: "Exercises",
      },
    ],
    summary: todaySnapshot.contractsMissed === 0 && todaySnapshot.checkinsCompleted >= 2
      ? "Strong momentum — all systems aligned"
      : todaySnapshot.contractsMissed > 1
      ? "Friction detected — contracts need attention"
      : "Steady progress with minor gaps",
  };

  // Friction - mapped to focus areas
  const friction: FocusAreaFriction[] = [
    {
      domain: "performance-focus",
      label: "Performance & Focus",
      negativeSignal: "2 missed focus blocks",
      count: 2,
      evidence: ["Wed: Skipped deep work session", "Fri: Interrupted by notifications"],
    },
  ];

  // Alignment - mapped to focus areas
  const alignment: FocusAreaAlignment[] = [
    {
      domain: "self-mastery",
      label: "Self-Mastery",
      positiveSignal: "3 contracts completed",
      streak: 3,
    },
  ];

  // Behaviour Cycle - compact with impact metrics
  const cycle: CycleData = {
    detected: true,
    name: "Missed morning → Contract cascade",
    description: "Skipping morning check-ins leads to violated contracts later in the day.",
    detectedCount: 3,
    timeframe: "last 14 days",
    timelineMarkers: ["Mon", "Wed", "Fri"],
    patternSummary: "On days with no morning check-in, contract adherence drops by 45%.",
    suggestedExperiment: "Set a fixed 9am check-in reminder for 5 days.",
    confidence: "Medium",
    impactMetrics: [
      { label: "Contracts affected", value: "67%" },
      { label: "Score drop", value: "-12 pts" },
      { label: "Recovery time", value: "2 days" },
    ],
  };

  // Trajectory - merged with check-in consistency
  const trajectory: TrajectoryData = {
    connectionDepth: 76,
    connectionDelta: 4,
    progressLevel: 64,
    progressDelta: 3,
    growthPercentage: 58,
    growthDelta: todaySnapshot.exercisesCompleted > 2 ? 5 : 2,
    checkInConsistency: {
      current: todaySnapshot.checkinsCompleted,
      target: todaySnapshot.checkinsExpected,
      percentage: Math.round((todaySnapshot.checkinsCompleted / Math.max(todaySnapshot.checkinsExpected, 1)) * 100),
    },
    timeframe: context === "today" ? "Today" : context === "7d" ? "Last 7 days" : context === "30d" ? "Last 30 days" : "This year",
  };

  return {
    pillars,
    todaySnapshot,
    behaviourMomentum,
    friction,
    alignment,
    cycle,
    trajectory,
    lastUpdated: new Date().toISOString(),
    dataSources: ["Focus Areas", "Contracts", "Check-ins", "Exercises"],
  };
}

// ============================================================================
// ANIMATION UTILITIES
// ============================================================================

const DURATION_MS = 600;

function animateValue(from: number, to: number, durationMs: number, onUpdate: (n: number) => void) {
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

// ============================================================================
// COMPONENTS
// ============================================================================

function TimeContextSwitcher({ value, onChange }: { value: TimeContext; onChange: (ctx: TimeContext) => void }) {
  const options: { value: TimeContext; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
    { value: "year", label: "Year" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-xl bg-vella-bg-card border border-vella-border/60 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            value === opt.value ? "bg-vella-text text-vella-bg-card" : "text-vella-muted hover:text-vella-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function AnimatedSparkline({
  data,
  score,
  delta,
  height = 20,
}: {
  data: number[];
  score: number;
  delta: number;
  height?: number;
}) {
  const [drawProgress, setDrawProgress] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 400;
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      setDrawProgress(eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [data]);

  // Color logic based on score ranges
  const getBarColor = () => {
    if (score >= 75) return "bg-emerald-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-rose-500";
  };

  // Glow effect based on delta
  const getGlowClass = () => {
    if (delta > 0) return "shadow-[0_0_6px_rgba(16,185,129,0.4)]";
    if (delta < 0) return "shadow-[0_0_4px_rgba(244,63,94,0.3)]";
    return "";
  };

  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {data.map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full ${getBarColor()} ${getGlowClass()} transition-opacity duration-150`}
          style={{
            height: `${Math.max(h * 100, 15)}%`,
            opacity: i / data.length < drawProgress ? 1 : 0,
            transitionDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

// TODAY SNAPSHOT - Lighter styling for wrapped context
function TodaySnapshotCard({ snapshot, timeframe }: { snapshot: TodaySnapshot; timeframe: TimeContext }) {
  const label = timeframe === "today" ? "Today" : timeframe === "7d" ? "This Week" : timeframe === "30d" ? "This Month" : "This Year";

  return (
    <div className="p-1">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-vella-accent-muted" />
        <h2 className="text-xs font-medium text-vella-text">{label} Snapshot</h2>
        <span className="text-[10px] text-vella-muted/60 ml-auto">From Inbox + Contracts</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-start gap-2">
          <div className="p-1.5 rounded-lg bg-rose-50">
            <FileText className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div>
            <div className="text-lg font-semibold text-vella-text tabular-nums">
              {snapshot.contractsTotal - snapshot.contractsMissed}/{snapshot.contractsTotal}
            </div>
            <div className="text-[10px] text-vella-muted">Contracts</div>
            {snapshot.contractsMissed > 0 && (
              <div className="text-[10px] text-rose-500">{snapshot.contractsMissed} missed</div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div>
            <div className="text-lg font-semibold text-vella-text tabular-nums">
              {snapshot.focusBlocksCompleted}/{snapshot.focusBlocksTotal}
            </div>
            <div className="text-[10px] text-vella-muted">Focus blocks</div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div>
            <div className="text-lg font-semibold text-vella-text tabular-nums">
              {snapshot.checkinsCompleted}/{snapshot.checkinsExpected}
            </div>
            <div className="text-[10px] text-vella-muted">Check-ins</div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="p-1.5 rounded-lg bg-amber-50">
            <Dumbbell className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div>
            <div className="text-lg font-semibold text-vella-text tabular-nums">
              {snapshot.exercisesCompleted}/{snapshot.exercisesTarget}
            </div>
            <div className="text-[10px] text-vella-muted">Exercises</div>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-vella-border/30 flex items-center justify-between text-[10px]">
        <span className="text-vella-muted/60">{snapshot.timeframe}</span>
        <span className="text-vella-muted/60">vs previous {label.toLowerCase()}</span>
      </div>
    </div>
  );
}

// BEHAVIOUR MOMENTUM CARD
function BehaviourMomentumCard({ momentum }: { momentum: BehaviourMomentum }) {
  return (
    <div className="rounded-xl bg-vella-bg-card border border-vella-border/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3.5 h-3.5 text-vella-accent-muted" />
        <h3 className="text-xs font-medium text-vella-text">Behaviour Momentum</h3>
      </div>

      <p className="text-xs text-vella-muted mb-2 line-clamp-1">{momentum.summary}</p>

      <div className="space-y-1.5">
        {momentum.shifts.map((shift) => {
          const Icon = shift.direction === "improving" ? TrendingUp : shift.direction === "declining" ? TrendingDown : Activity;
          const color = shift.direction === "improving" ? "text-emerald-600" : shift.direction === "declining" ? "text-rose-500" : "text-slate-500";

          return (
            <div key={shift.label} className="flex items-center justify-between py-1 border-t border-vella-border/30 first:border-0 first:pt-0">
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-xs text-vella-text">{shift.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${color}`}>{shift.delta}%</span>
                <span className="text-[9px] text-vella-muted/50">{shift.source}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// FOCUS AREA PILLAR CARD - Prominent styling
function FocusAreaPillarCard({ pillar, onTap }: { pillar: FocusAreaPillar; onTap: () => void }) {
  const [displayScore, setDisplayScore] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    animateValue(0, pillar.score, DURATION_MS, setDisplayScore);
  }, [pillar.score]);

  // Score-based delta color
  const getDeltaColor = () => {
    if (pillar.delta > 0) return "text-emerald-600";
    if (pillar.delta < 0) return "text-rose-500";
    return "text-slate-500";
  };

  const deltaArrow = pillar.delta > 0 ? "↑" : pillar.delta < 0 ? "↓" : "→";

  // Score-based card accent
  const getCardAccent = () => {
    if (pillar.score >= 75) return "border-emerald-200 shadow-sm";
    if (pillar.score >= 50) return "border-amber-200 shadow-sm";
    return "border-rose-200 shadow-sm";
  };

  return (
    <button
      onClick={onTap}
      className={`rounded-2xl bg-vella-bg-card border ${getCardAccent()} p-5 text-left pressable w-full`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-vella-muted line-clamp-1">{pillar.label}</span>
        <span className={`text-xs font-semibold ${getDeltaColor()}`}>{deltaArrow} {Math.abs(pillar.delta)}</span>
      </div>

      <div className="mt-3 text-4xl font-semibold text-vella-text tabular-nums">{displayScore}</div>

      <div className="mt-4">
        <AnimatedSparkline data={pillar.sparkline} score={pillar.score} delta={pillar.delta} height={24} />
      </div>

      <p className="mt-4 text-[11px] text-vella-muted leading-relaxed line-clamp-1">Driven by: {pillar.drivenBy}</p>

      <div className="mt-3 flex items-center gap-2 text-[10px] text-vella-muted/70">
        <span>Check-ins: {pillar.breakdown.checkins}</span>
        <span>•</span>
        <span>Blocks: {pillar.breakdown.focusBlocksCompleted}</span>
      </div>
    </button>
  );
}

// PILLAR DETAIL - FLOATING CENTERED MODAL
function PillarDetailModal({ open, onClose, pillar }: { open: boolean; onClose: () => void; pillar: FocusAreaPillar | null }) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open || !pillar) return null;

  return (
    <>
      {/* Backdrop with blur */}
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      {/* Floating centered modal */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="w-[92%] max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-vella-border bg-vella-bg-card shadow-2xl pointer-events-auto animate-fadeScale"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-vella-border bg-vella-bg-card rounded-t-2xl">
            <h2 className="text-base font-semibold text-vella-text">{pillar.label}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-vella-muted hover:text-vella-text pressable"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content - compact padding */}
          <div className="px-4 py-4 space-y-4">
            {/* Score */}
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-vella-text">{pillar.score}</span>
              <span className="text-sm text-vella-muted">/100</span>
              <span className={pillar.delta >= 0 ? "text-emerald-600 text-xs ml-2" : "text-rose-500 text-xs ml-2"}>
                {pillar.delta >= 0 ? "↑" : "↓"} {Math.abs(pillar.delta)} vs last period
              </span>
            </div>

            {/* Data breakdown */}
            <div className="rounded-lg bg-vella-bg border border-vella-border/60 p-3">
              <h4 className="text-[10px] font-medium text-vella-muted uppercase mb-2">Based on</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-vella-muted text-xs">Check-ins</span>
                  <span className="text-vella-text tabular-nums text-xs">{pillar.breakdown.checkins}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vella-muted text-xs">Focus blocks</span>
                  <span className="text-vella-text tabular-nums text-xs">{pillar.breakdown.focusBlocksCompleted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vella-muted text-xs">Violations</span>
                  <span className="text-rose-500 tabular-nums text-xs">{pillar.breakdown.violations}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vella-muted text-xs">Adherence</span>
                  <span className="text-vella-text tabular-nums text-xs">{pillar.breakdown.contractsAdherence}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vella-muted text-xs">Contracts</span>
                  <span className="text-vella-text tabular-nums text-xs">{pillar.breakdown.contractsCompleted}/{pillar.breakdown.contractsTotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vella-muted text-xs">Exercises</span>
                  <span className="text-vella-text tabular-nums text-xs">{pillar.breakdown.exercisesCompleted}/{pillar.breakdown.exercisesTarget}</span>
                </div>
              </div>
            </div>

            {/* Timeframe */}
            <div>
              <h4 className="text-[10px] font-medium text-vella-muted uppercase mb-1">Timeframe</h4>
              <p className="text-xs text-vella-text">{pillar.breakdown.timeframe}</p>
            </div>

            {/* Driver */}
            <div>
              <h4 className="text-[10px] font-medium text-vella-muted uppercase mb-1">Primary Driver</h4>
              <p className="text-xs text-vella-text">{pillar.drivenBy}</p>
            </div>

            {/* Calculation */}
            <div className="rounded-lg bg-vella-bg border border-vella-border/60 p-3">
              <h4 className="text-[10px] font-medium text-vella-muted uppercase mb-1">How this is calculated</h4>
              <p className="text-xs text-vella-muted leading-relaxed">
                Score combines check-in frequency (40%) and contract adherence (60%). Higher completion rates improve this score.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// BEHAVIOUR PATTERN - FLOATING COMPACT MODAL
function BehaviourPatternModal({ open, onClose, cycle }: { open: boolean; onClose: () => void; cycle: CycleData }) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;

  const confidenceColor =
    cycle.confidence === "High" ? "bg-emerald-100 text-emerald-700" :
    cycle.confidence === "Medium" ? "bg-amber-100 text-amber-700" :
    "bg-rose-100 text-rose-700";

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      {/* Floating centered modal */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="w-[92%] max-w-md max-h-[85vh] overflow-y-auto rounded-xl border border-vella-border bg-vella-bg-card shadow-2xl pointer-events-auto animate-fadeScale"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header - compact */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-vella-border bg-vella-bg-card rounded-t-xl">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
              <h2 className="text-sm font-semibold text-vella-text">Pattern Detected</h2>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${confidenceColor}`}>{cycle.confidence}</span>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-vella-muted hover:text-vella-text pressable ml-2"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content - 20% less padding, tight spacing */}
          <div className="px-3 py-3 space-y-3">
            {/* Pattern title */}
            <div>
              <p className="text-sm font-medium text-vella-text">{cycle.name}</p>
              <p className="text-xs text-vella-muted mt-0.5 line-clamp-2">{cycle.description}</p>
            </div>

            {/* Mini timeline row */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-vella-muted">{cycle.detectedCount}x:</span>
              {cycle.timelineMarkers.map((m) => (
                <span key={m} className="px-1.5 py-0.5 rounded bg-vella-bg border border-vella-border text-[10px] text-vella-muted">{m}</span>
              ))}
            </div>

            {/* Impact metrics - compact */}
            <div className="flex gap-2">
              {cycle.impactMetrics.slice(0, 3).map((m) => (
                <div key={m.label} className="flex-1 rounded-md bg-vella-bg border border-vella-border/60 py-1.5 px-1 text-center">
                  <div className="text-sm font-semibold text-vella-text">{m.value}</div>
                  <div className="text-[9px] text-vella-muted leading-tight">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Short summary - max 2 lines */}
            <p className="text-xs text-vella-muted leading-relaxed line-clamp-2">{cycle.patternSummary}</p>

            {/* Suggested experiment - highlighted box */}
            <div className="rounded-md bg-amber-50 border border-amber-100 p-2.5">
              <h4 className="text-[10px] font-medium text-amber-700 uppercase mb-1">Suggested Experiment</h4>
              <p className="text-xs text-amber-800 leading-snug">{cycle.suggestedExperiment}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// FRICTION EVIDENCE - FLOATING COMPACT MODAL
function FrictionEvidenceModal({ open, onClose, item }: { open: boolean; onClose: () => void; item: FocusAreaFriction | null }) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open || !item) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      {/* Floating centered modal */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div
          className="w-[92%] max-w-sm max-h-[70vh] overflow-y-auto rounded-xl border border-vella-border bg-vella-bg-card shadow-2xl pointer-events-auto animate-fadeScale"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-vella-border bg-vella-bg-card rounded-t-xl">
            <h2 className="text-sm font-semibold text-vella-text">{item.label}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-vella-muted hover:text-vella-text pressable"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-3 py-3 space-y-3">
            <p className="text-sm text-rose-500">{item.negativeSignal}</p>

            {item.evidence.length > 0 && (
              <div>
                <h4 className="text-[10px] font-medium text-vella-muted uppercase mb-1.5">Evidence</h4>
                <ul className="space-y-1">
                  {item.evidence.map((ev, i) => (
                    <li key={i} className="text-xs text-vella-muted flex items-start gap-1.5">
                      <span className="text-vella-border">•</span>
                      {ev}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-[10px] text-vella-muted/60">Source: Contracts • Compared to: Last 7 days</div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// MAIN CLARITY PAGE
// ============================================================================

export default function ClarityPage() {
  const [timeContext, setTimeContext] = useState<TimeContext>("today");
  const [data] = useState<ClarityData>(() => generateDeterministicData("today"));
  const [selectedPillar, setSelectedPillar] = useState<FocusAreaPillar | null>(null);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [selectedFriction, setSelectedFriction] = useState<FocusAreaFriction | null>(null);

  // Regenerate data when timeframe changes
  const currentData = useMemo(() => generateDeterministicData(timeContext), [timeContext]);

  return (
    <div className="min-h-screen bg-vella-bg pb-24">
      {/* Animation styles */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
        .animate-fadeScale {
          animation: fadeScale 0.25s ease-out forwards;
        }
      `}</style>

      <div className="px-5 py-6 space-y-5">
        {/* HEADER */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-vella-text">Clarity</h1>
            <p className="text-sm text-vella-muted mt-0.5">Derived from your Focus Areas</p>
          </div>
          <TimeContextSwitcher value={timeContext} onChange={setTimeContext} />
        </header>

        {/* 1️⃣ TOP FOCUS AREAS - KPIs FIRST (Most Prominent) */}
        <section>
          <h2 className="text-sm font-medium text-vella-muted mb-3 uppercase tracking-wide">Top Focus Areas</h2>
          <div className="grid grid-cols-3 gap-3">
            {currentData.pillars.map((pillar) => (
              <FocusAreaPillarCard key={pillar.domain} pillar={pillar} onTap={() => setSelectedPillar(pillar)} />
            ))}
          </div>
        </section>

        {/* Pillar Detail Modal */}
        <PillarDetailModal open={!!selectedPillar} onClose={() => setSelectedPillar(null)} pillar={selectedPillar} />

        {/* 2️⃣ TODAY SNAPSHOT - Contextual (Lighter BG) */}
        <section className="rounded-2xl bg-vella-bg border border-vella-border/40 p-4">
          <TodaySnapshotCard snapshot={currentData.todaySnapshot} timeframe={timeContext} />
        </section>

        {/* 3️⃣ FRICTION & ALIGNMENT - Side by Side (Compact) */}
        <div className="grid grid-cols-2 gap-2">
          <section>
            <h2 className="text-xs font-medium text-vella-muted mb-1.5 uppercase tracking-wide">Friction</h2>
            <div className="space-y-1.5">
              {currentData.friction.map((item) => (
                <button
                  key={item.domain}
                  onClick={() => setSelectedFriction(item)}
                  className="w-full text-left rounded-lg bg-vella-bg-card border border-vella-border/60 p-2.5 pressable"
                >
                  <div className="text-xs font-medium text-vella-text line-clamp-1">{item.label}</div>
                  <div className="text-[10px] text-rose-500 mt-0.5 line-clamp-1">{item.negativeSignal}</div>
                </button>
              ))}
              {currentData.friction.length === 0 && (
                <div className="rounded-lg bg-vella-bg-card border border-vella-border/60 p-2.5">
                  <div className="text-xs text-vella-muted">No friction</div>
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-vella-muted mb-1.5 uppercase tracking-wide">Alignment</h2>
            <div className="space-y-1.5">
              {currentData.alignment.map((item) => (
                <div key={item.domain} className="rounded-lg bg-vella-bg-card border border-vella-border/60 p-2.5">
                  <div className="text-xs font-medium text-vella-text line-clamp-1">{item.label}</div>
                  <div className="text-[10px] text-emerald-600 mt-0.5 line-clamp-1">{item.positiveSignal}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Friction Evidence Modal */}
        <FrictionEvidenceModal open={!!selectedFriction} onClose={() => setSelectedFriction(null)} item={selectedFriction} />

        {/* 4️⃣ BEHAVIOUR MOMENTUM - Between Friction/Alignment and Pattern */}
        <BehaviourMomentumCard momentum={currentData.behaviourMomentum} />

        {/* 5️⃣ BEHAVIOUR PATTERN - Single Card */}
        {currentData.cycle.detected && (
          <section>
            <h2 className="text-xs font-medium text-vella-muted mb-1.5 uppercase tracking-wide">Pattern</h2>
            <button
              onClick={() => setCycleOpen(true)}
              className="w-full rounded-xl bg-vella-bg-card border border-vella-border/60 p-3 flex items-center justify-between pressable"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1 rounded-md bg-amber-50">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-vella-text line-clamp-1">{currentData.cycle.name}</p>
                  <p className="text-[10px] text-vella-muted">{currentData.cycle.detectedCount}x in {currentData.cycle.timeframe}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-vella-muted" />
            </button>
          </section>
        )}

        {/* Behaviour Pattern Modal */}
        <BehaviourPatternModal open={cycleOpen} onClose={() => setCycleOpen(false)} cycle={currentData.cycle} />

        {/* 6️⃣ TRAJECTORY - Bottom Most (Clean, Compact) */}
        <section className="rounded-xl bg-vella-bg-card border border-vella-border/60 p-3">
          <h2 className="text-xs font-medium text-vella-muted mb-2 uppercase tracking-wide">Trajectory</h2>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-vella-muted">Connection</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-vella-text tabular-nums">{currentData.trajectory.connectionDepth}%</span>
                <span className={currentData.trajectory.connectionDelta >= 0 ? "text-emerald-600 text-[10px]" : "text-rose-500 text-[10px]"}>
                  {currentData.trajectory.connectionDelta >= 0 ? "↑" : "↓"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-vella-muted">Progress</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-vella-text tabular-nums">{currentData.trajectory.progressLevel}%</span>
                <span className={currentData.trajectory.progressDelta >= 0 ? "text-emerald-600 text-[10px]" : "text-rose-500 text-[10px]"}>
                  {currentData.trajectory.progressDelta >= 0 ? "↑" : "↓"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-vella-muted">Growth</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-vella-text tabular-nums">{currentData.trajectory.growthPercentage}%</span>
                <span className={currentData.trajectory.growthDelta >= 0 ? "text-emerald-600 text-[10px]" : "text-rose-500 text-[10px]"}>
                  {currentData.trajectory.growthDelta >= 0 ? "↑" : "↓"}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-vella-border/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-vella-muted">Check-ins</span>
                <span className="text-sm font-medium text-vella-text tabular-nums">{currentData.trajectory.checkInConsistency.percentage}%</span>
              </div>
              <div className="text-[10px] text-vella-muted/70 mt-0.5">
                {currentData.trajectory.checkInConsistency.current}/{currentData.trajectory.checkInConsistency.target} • {currentData.trajectory.timeframe}
              </div>
            </div>
          </div>
        </section>

        {/* LAST UPDATED */}
        <div className="text-center pt-2">
          <span className="text-[10px] text-vella-muted/40">
            Updated {new Date(currentData.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}
