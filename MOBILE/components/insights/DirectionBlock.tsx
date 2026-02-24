"use client";

import { motion } from "framer-motion";

export type DirectionData = {
  recoveryTrend: string;
  disciplineTrend: string;
  focusTrend: string;
  cycleDetected: boolean;
};

function formatTrend(t: string): string {
  if (!t) return "—";
  return t.replace(/_/g, " ");
}

function TrendRow({ label, trend }: { label: string; trend: string }) {
  const t = trend.toLowerCase();
  const isUp = t === "improving";
  const isDown = t === "declining";
  const isCycle = t === "cyclical";
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-vella-muted">{label}</span>
      <div className="flex items-center gap-2">
        {isUp && <span className="text-vella-muted" aria-hidden>→</span>}
        {isDown && <span className="text-vella-muted" aria-hidden>←</span>}
        {isCycle && <span className="text-vella-muted" aria-hidden>↔</span>}
        <span className="text-sm font-medium text-vella-text">{formatTrend(trend)}</span>
      </div>
    </div>
  );
}

type DirectionBlockProps = {
  data: DirectionData;
};

export function DirectionBlock({ data }: DirectionBlockProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="space-y-4 border-t border-vella-border pt-6"
    >
      <h2 className="text-lg font-semibold tracking-tight text-vella-text">Direction</h2>
      <div className="space-y-0">
        <TrendRow label="Discipline trend" trend={data.disciplineTrend} />
        <TrendRow label="Focus trend" trend={data.focusTrend} />
        <TrendRow label="Recovery trend" trend={data.recoveryTrend} />
      </div>
      {data.cycleDetected && (
        <p className="text-sm text-vella-muted">Behaviour cycle detected.</p>
      )}
    </motion.section>
  );
}
