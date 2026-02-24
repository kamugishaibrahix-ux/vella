"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "./types";

interface EntryComparisonModalProps {
  older: JournalEntry;
  recent: JournalEntry;
  onClose: () => void;
  className?: string;
}

export function EntryComparisonModal({ older, recent, onClose, className }: EntryComparisonModalProps) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-title"
    >
      <div
        className={cn(
          "w-full max-w-[430px] max-h-[85dvh] overflow-y-auto rounded-2xl border-2 border-vella-border bg-vella-bg-card shadow-xl",
          "p-6 space-y-6",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="comparison-title" className="font-serif text-lg font-semibold text-vella-text">
            Then and now
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-vella-muted hover:text-vella-text hover:bg-vella-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-vella-primary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <section>
          <p className="text-xs font-medium text-vella-muted uppercase tracking-wide mb-2">
            Earlier
          </p>
          <div className="rounded-xl border border-vella-border bg-vella-bg p-4">
            <p className="text-sm text-vella-text leading-relaxed">
              {older.preview || older.title || "—"}
            </p>
          </div>
        </section>

        <section>
          <p className="text-xs font-medium text-vella-muted uppercase tracking-wide mb-2">
            Recent
          </p>
          <div className="rounded-xl border border-vella-primary/30 bg-[var(--vella-accent-soft)]/50 p-4">
            <p className="text-sm text-vella-text leading-relaxed">
              {recent.preview || recent.title || "—"}
            </p>
          </div>
        </section>

        <p className="text-xs text-vella-muted text-center">
          Narrative contrast only — no scores or analytics.
        </p>
      </div>
    </div>
  );
}
