"use client";

import { cn } from "@/lib/utils";

type Tier = "steady" | "mixed" | "fragile";

type ConsistencyStatusBarProps = {
  tier: Tier;
  className?: string;
};

const TIER_BG: Record<Tier, string> = {
  steady: "bg-emerald-500 dark:bg-emerald-600",
  mixed: "bg-vella-muted/40 dark:bg-vella-muted/30",
  fragile: "bg-amber-400/80 dark:bg-amber-600/60",
};

export function ConsistencyStatusBar({ tier, className }: ConsistencyStatusBarProps) {
  return (
    <div
      role="status"
      aria-label={`Consistency: ${tier}`}
      className={cn(
        "h-1.5 w-full rounded-full overflow-hidden transition-colors duration-200 ease-in-out",
        TIER_BG[tier],
        className
      )}
    />
  );
}
