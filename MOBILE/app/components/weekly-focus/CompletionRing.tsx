"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type CompletionRingProps = {
  /** 0–100. Use either percent or value (alias). */
  percent?: number;
  /** 0–100. Backward-compat alias for percent. */
  value?: number;
  label: string;
  /** When 0 and percent is 0, show "—" and "No check-ins yet". */
  checkinCount?: number;
  size?: "sm" | "md";
  className?: string;
};

const SIZES = {
  sm: { size: 64, stroke: 3, r: 28, fontSize: "text-lg" },
  md: { size: 100, stroke: 6, r: 44, fontSize: "text-2xl" },
};

const norm = (v: number) => Math.min(100, Math.max(0, v)) / 100;

/** Stroke color by percent: 0–40 amber, 40–70 neutral, 70–100 emerald. */
function getStrokeClass(p: number): string {
  if (p >= 0.7) return "text-emerald-600 dark:text-emerald-500";
  if (p >= 0.4) return "text-vella-muted";
  return "text-amber-500 dark:text-amber-600";
}

export function CompletionRing({
  percent: percentProp,
  value: valueProp,
  label,
  checkinCount = undefined,
  size = "md",
  className,
}: CompletionRingProps) {
  const percent = percentProp ?? valueProp ?? 0;
  const [displayPercent, setDisplayPercent] = useState(percent);
  const config = SIZES[size];
  const C = 2 * Math.PI * config.r;
  const p = norm(displayPercent);
  const dash = p * C;
  const gap = C - dash;
  const noCheckinsYet = checkinCount === 0 && percent === 0;

  useEffect(() => {
    setDisplayPercent(percent);
  }, [percent]);

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div className="relative inline-flex items-center justify-center">
        <svg
          width={config.size}
          height={config.size}
          viewBox={`0 0 ${config.size} ${config.size}`}
          className="-rotate-90 transition-[stroke-dasharray] duration-[300ms] ease-in-out"
          aria-hidden
        >
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={config.r}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.stroke}
            className="text-vella-border"
          />
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={config.r}
            fill="none"
            stroke="currentColor"
            strokeWidth={config.stroke}
            strokeLinecap="round"
            className={cn("transition-[stroke-dasharray] duration-[300ms] ease-in-out", getStrokeClass(p))}
            strokeDasharray={`${dash} ${gap}`}
          />
        </svg>
        <span
          className={cn(
            "absolute font-semibold tabular-nums text-vella-text",
            config.fontSize
          )}
        >
          {noCheckinsYet ? "—" : `${Math.round(displayPercent)}%`}
        </span>
      </div>
      <span className="text-xs text-vella-muted">
        {noCheckinsYet ? "No check-ins yet" : label}
      </span>
    </div>
  );
}
