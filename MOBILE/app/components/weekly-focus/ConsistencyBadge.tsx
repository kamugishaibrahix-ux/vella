"use client";

import { cn } from "@/lib/utils";

type Tier = "steady" | "mixed" | "fragile";

type ConsistencyBadgeProps = {
  tier: Tier;
  className?: string;
};

const TIER_STYLES: Record<Tier, string> = {
  steady:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800",
  mixed:
    "bg-vella-bg-card text-vella-muted border-vella-border dark:bg-vella-muted/10 dark:text-vella-muted",
  fragile:
    "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 border-amber-200 dark:border-amber-800",
};

export function ConsistencyBadge({ tier, className }: ConsistencyBadgeProps) {
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TIER_STYLES[tier],
        className
      )}
    >
      {label}
    </span>
  );
}
