"use client";

import { cn } from "@/lib/utils";

type EarnedValidationBlockProps = {
  className?: string;
};

const EARNED_PHRASES = [
  "You held your commitment.",
  "You stayed aligned despite friction.",
];

type EarnedValidationBlockProps = {
  className?: string;
  /** 0 or 1 for deterministic single line */
  variant?: 0 | 1;
};

export function EarnedValidationBlock({ className, variant = 0 }: EarnedValidationBlockProps) {
  const line = EARNED_PHRASES[variant] ?? EARNED_PHRASES[0];

  return (
    <div
      className={cn(
        "rounded-vella-card border border-vella-border bg-vella-accent-soft/50 p-3",
        "dark:bg-vella-accent/10 dark:border-vella-accent-muted/30",
        className
      )}
    >
      <p className="text-sm font-medium text-vella-text">{line}</p>
    </div>
  );
}
