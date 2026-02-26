"use client";

import type { WeeklyContract, Rating } from "@/app/checkin/types";

interface ContractCardProps {
  contract: WeeklyContract;
  rating?: Rating;
  onRate: (rating: Rating) => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleteConfirm?: boolean;
  onCancelDelete?: () => void;
}

const RATING_OPTIONS: Rating[] = ["strong", "neutral", "struggling"];

const RATING_STYLES: Record<Rating, { bg: string; border: string; text: string }> = {
  strong: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
  },
  neutral: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-600",
  },
  struggling: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
  },
};

export function ContractCard({ 
  contract, 
  rating, 
  onRate, 
  onEdit, 
  onDelete, 
  isDeleteConfirm, 
  onCancelDelete 
}: ContractCardProps) {
  const isVella = contract.origin === "vella";

  const isRated = rating !== undefined;

  return (
    <div 
      className="relative rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-transform duration-200 ease-out"
      style={{ 
        transform: isRated ? 'scale(1.02)' : 'scale(1)',
        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {/* Delete Confirmation Overlay */}
      {isDeleteConfirm && (
        <div className="absolute inset-0 z-10 bg-white/95 flex flex-col items-center justify-center p-4">
          <p className="text-sm font-medium text-slate-900 mb-2">
            {isVella ? "Remove Suggested Contract?" : "Delete Contract?"}
          </p>
          <p className="text-xs text-slate-500 text-center mb-4">
            {isVella 
              ? "This contract was suggested by Vella. You can re-add it later." 
              : "This will permanently delete your contract."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancelDelete}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onDelete}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isVella 
                  ? "bg-amber-100 hover:bg-amber-200 text-amber-700" 
                  : "bg-red-100 hover:bg-red-200 text-red-700"
              }`}
            >
              {isVella ? "Remove" : "Delete"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {contract.focusArea}
              </p>
              {isVella && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-600">
                  Suggested
                </span>
              )}
            </div>
            <h3 className="text-sm font-medium text-slate-900 leading-snug line-clamp-2">
              {contract.title}
            </h3>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Edit contract"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              aria-label="Delete contract"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Rating Selector */}
      <div className="px-4 pb-4">
        <div className="flex gap-2">
          {RATING_OPTIONS.map((r) => {
            const isSelected = rating === r;
            const styles = RATING_STYLES[r];

            return (
              <button
                key={r}
                onClick={() => onRate(isSelected ? undefined as unknown as Rating : r)}
                className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-medium border transition-all duration-200 ${
                  isSelected
                    ? `${styles.bg} ${styles.border} ${styles.text}`
                    : isRated 
                      ? "bg-slate-50 border-slate-100 text-slate-400"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
                style={{
                  transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
