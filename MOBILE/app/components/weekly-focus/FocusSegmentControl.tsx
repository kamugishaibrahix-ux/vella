"use client";

import { cn } from "@/lib/utils";
import type { Rating } from "@/app/checkin/types";

const OPTIONS: { value: Rating; label: string }[] = [
  { value: "strong", label: "Strong" },
  { value: "neutral", label: "Neutral" },
  { value: "struggling", label: "Struggling" },
];

type FocusSegmentControlProps = {
  value: Rating | null;
  onChange: (rating: Rating) => void;
  disabled?: boolean;
  "aria-label"?: string;
};

export function FocusSegmentControl({
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel = "Rate this focus area",
}: FocusSegmentControlProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-full border border-vella-border bg-vella-bg p-0.5"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "min-w-0 flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ease-in-out pressable",
            "disabled:opacity-50 disabled:pointer-events-none",
            value === opt.value
              ? opt.value === "strong"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : opt.value === "struggling"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  : "bg-vella-muted/20 text-vella-text dark:bg-vella-muted/30"
              : "text-vella-muted hover:text-vella-text"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
