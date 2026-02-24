"use client";

import Link from "next/link";
import { CompletionRing } from "./CompletionRing";
import { ConsistencyStatusBar } from "./ConsistencyStatusBar";
import { EarnedValidationBlock } from "./EarnedValidationBlock";
import { getSubjectLabel } from "@/app/checkin/focusLabels";
import type { WeeklyFocusReview } from "@/app/checkin/types";

type ReviewPanelProps = {
  review: WeeklyFocusReview;
  onReturnHome?: () => void;
  className?: string;
};

export function ReviewPanel({ review, onReturnHome, className }: ReviewPanelProps) {
  const strongestLabel = getSubjectLabel(review.strongestSubjectCode);
  const weakestLabel = getSubjectLabel(review.weakestSubjectCode);

  return (
    <div className={className}>
      <div className="flex flex-col gap-4">
        <CompletionRing
          value={review.completionScore0to100}
          label="Consistency This Week"
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-vella-card border border-vella-border bg-vella-bg-card p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-vella-muted">
              Most Stable
            </p>
            <p className="mt-1 text-sm font-medium text-vella-text">{strongestLabel}</p>
          </div>
          <div className="rounded-vella-card border border-vella-border bg-vella-bg-card p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-vella-muted">
              Needs Attention
            </p>
            <p className="mt-1 text-sm font-medium text-vella-text">{weakestLabel}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-vella-muted">Consistency</span>
          <ConsistencyStatusBar tier={review.consistencyTier} />
        </div>

        {review.earnedValidationEligible && (
          <EarnedValidationBlock variant={0} />
        )}

        {review.suggestedNextWeek.length > 0 && (
          <div className="border-t border-vella-border pt-3">
            <h3 className="text-sm font-semibold text-vella-text">Next Week Focus</h3>
            <ul className="mt-2 space-y-1">
              {review.suggestedNextWeek.slice(0, 5).map((item) => (
                <li key={item.itemId} className="text-sm text-vella-muted">
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-1">
          <Link
            href="/home"
            onClick={onReturnHome}
            className="block w-full rounded-vella-button bg-vella-accent py-3 text-center text-sm font-medium text-white pressable transition-transform duration-200 ease-in-out"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
