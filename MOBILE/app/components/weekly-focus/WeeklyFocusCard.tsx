"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { FocusSegmentControl } from "./FocusSegmentControl";
import { getHelpOptions } from "@/lib/focus/helpOptions";
import { getIntervention } from "@/lib/focus/interventions";
import type { WeeklyFocusItem, Rating as FocusRating } from "@/app/checkin/types";

type WeeklyFocusCardProps = {
  item: WeeklyFocusItem;
  value: FocusRating | null;
  onChange: (rating: FocusRating) => void;
  disabled?: boolean;
  localRatingValue?: number;
  submittedToday?: boolean;
  onDiscussWithVella?: (item: WeeklyFocusItem) => void | Promise<void>;
};

const MICROCOPY: Record<FocusRating, string | null> = {
  strong: "Keep reinforcing this.",
  neutral: null,
  struggling: "Stabilise this early.",
};

export function WeeklyFocusCard({
  item,
  value,
  onChange,
  disabled,
  localRatingValue,
  submittedToday = false,
  onDiscussWithVella,
}: WeeklyFocusCardProps) {
  const [showQuickHelp, setShowQuickHelp] = useState(false);
  const [selectedCause, setSelectedCause] = useState<string | null>(null);
  const microcopy = value ? MICROCOPY[value] : null;
  const showIntervention =
    !submittedToday && (localRatingValue === 1 || localRatingValue === 0);
  const options = getHelpOptions(item.subjectCode);
  const intervention =
    showQuickHelp && selectedCause ? getIntervention(item.subjectCode, selectedCause) : null;

  if (submittedToday) {
    return (
      <div
        className={cn(
          "rounded-vella-card border border-vella-border bg-vella-bg-card p-3 shadow-vella-soft",
          "flex flex-col gap-2.5"
        )}
      >
        <span className="text-base font-medium text-vella-text leading-tight">
          {item.label}
        </span>
        <p className="text-sm text-vella-muted">Logged for today ✓</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-vella-card border bg-vella-bg-card p-3 shadow-vella-soft",
        "flex flex-col gap-2.5 transition-all duration-200 ease-in-out",
        value === "strong" && "bg-emerald-50/60 dark:bg-emerald-900/15 border-vella-border",
        value === "struggling" &&
          "border-amber-300/60 dark:border-amber-600/40 shadow-[0_0_0_1px_rgba(245,158,11,0.15)]",
        !value && "border-vella-border"
      )}
    >
      <span className="text-base font-medium text-vella-text leading-tight">
        {item.label}
      </span>
      <hr className="border-vella-border" />
      <FocusSegmentControl
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-label={`Rate: ${item.label}`}
      />
      {microcopy && (
        <p className="text-xs text-vella-muted italic transition-opacity duration-200 ease-in-out">
          {microcopy}
        </p>
      )}

      {showIntervention && !showQuickHelp && (
        <div className="intervention-panel mt-2 rounded-vella-button border border-vella-border bg-vella-bg p-2.5">
          <p className="text-xs text-vella-muted mb-2">Need support with this right now?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowQuickHelp(true)}
              className="rounded-vella-button border border-vella-border bg-vella-bg-card px-2.5 py-1.5 text-xs font-medium text-vella-text pressable"
            >
              Quick help
            </button>
            <button
              type="button"
              onClick={() => onDiscussWithVella?.(item)}
              className="rounded-vella-button border border-vella-border bg-vella-bg-card px-2.5 py-1.5 text-xs font-medium text-vella-text pressable"
            >
              Discuss with Vella
            </button>
          </div>
        </div>
      )}

      {showIntervention && showQuickHelp && !intervention && (
        <div className="intervention-panel mt-2 rounded-vella-button border border-vella-border bg-vella-bg p-2.5">
          <p className="text-xs text-vella-muted mb-2">What best describes it?</p>
          <div className="flex flex-col gap-1.5">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSelectedCause(opt)}
                className="rounded-vella-button border border-vella-border bg-vella-bg-card px-2.5 py-1.5 text-left text-xs font-medium text-vella-text pressable"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {showIntervention && intervention && (
        <div className="intervention-panel mt-2 rounded-vella-button border border-vella-border bg-vella-accent-soft/30 p-2.5">
          <p className="text-xs font-medium text-vella-text">{intervention.title}</p>
          <p className="text-xs text-vella-muted mt-1">{intervention.body}</p>
          <button
            type="button"
            onClick={() => {
              setShowQuickHelp(false);
              setSelectedCause(null);
            }}
            className="mt-2 rounded-vella-button bg-vella-accent/80 px-2.5 py-1.5 text-xs font-medium text-white pressable"
          >
            Mark done
          </button>
        </div>
      )}
    </div>
  );
}
