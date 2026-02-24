"use client";

import { cn } from "@/lib/utils";

/** 0–1, fill amount. Small ring, no number. Smooth animation. */
type AlignmentRingProps = {
  value: number;
  className?: string;
};

const STROKE = 2.5;
const R = 18;
const C = 2 * Math.PI * R;

export function AlignmentRing({ value, className }: AlignmentRingProps) {
  const p = Math.min(1, Math.max(0, value));
  const dash = p * C;
  const gap = C - dash;

  return (
    <svg
      width={40}
      height={40}
      viewBox="0 0 40 40"
      className={cn("-rotate-90 transition-[stroke-dasharray] duration-[200ms] ease-in-out", className)}
      aria-hidden
    >
      <circle
        cx="20"
        cy="20"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        className="text-vella-border"
      />
      <circle
        cx="20"
        cy="20"
        r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        className="text-vella-accent"
        strokeDasharray={`${dash} ${gap}`}
      />
    </svg>
  );
}
