"use client";

import { cn } from "@/lib/utils";
import type { JournalMode } from "./types";

interface EntryModeCardProps {
  mode: JournalMode;
  isActive: boolean;
  onSelect: () => void;
}

export function EntryModeCard({ mode, isActive, onSelect }: EntryModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-2xl border-2 transition-colors duration-200 py-4 px-4",
        "bg-vella-bg-card border-vella-border shadow-[var(--vella-elevation)]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-vella-primary focus-visible:ring-offset-2",
        isActive
          ? "border-vella-primary bg-[var(--vella-accent-soft)] text-vella-text"
          : "hover:border-vella-primary/40 hover:bg-vella-bg-card active:scale-[0.98]"
      )}
      aria-pressed={isActive}
      aria-label={`Select mode: ${mode.label}`}
    >
      <span className="font-medium text-[15px] text-vella-text">{mode.label}</span>
    </button>
  );
}
