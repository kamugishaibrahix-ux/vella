"use client";

import { cn } from "@/lib/utils";
import type { JournalEntry } from "./types";

interface JournalEntryCardProps {
  entry: JournalEntry;
  onEdit?: (entry: JournalEntry) => void;
  onDelete?: (entry: JournalEntry) => void;
  className?: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

export function JournalEntryCard({ entry, onEdit, onDelete, className }: JournalEntryCardProps) {
  return (
    <article
      className={cn(
        "rounded-2xl border-2 border-vella-border bg-vella-bg-card p-4 shadow-[var(--vella-elevation)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-[15px] text-vella-text line-clamp-2">
            {entry.title || "Untitled"}
          </h3>
          <p className="mt-1 text-xs text-vella-muted">{formatDate(entry.createdAt)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-vella-muted bg-vella-bg px-2 py-0.5 rounded-md">
              {entry.modeLabel}
            </span>
            {entry.sharedWithVella && (
              <span className="text-xs font-medium text-vella-primary bg-[var(--vella-accent-soft)] px-2 py-0.5 rounded-md">
                Shared with Vella
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(entry)}
              className="p-2 rounded-xl text-vella-muted hover:text-vella-primary hover:bg-[var(--vella-accent-soft)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-vella-primary"
              aria-label="Edit entry"
            >
              <EditIcon />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(entry)}
              className="p-2 rounded-xl text-vella-muted hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-vella-primary"
              aria-label="Delete entry"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
