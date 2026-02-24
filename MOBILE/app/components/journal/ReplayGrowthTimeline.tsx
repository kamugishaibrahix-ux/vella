"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "./types";

export interface ReplayNode {
  weekLabel: string;
  entries: JournalEntry[];
}

interface ReplayGrowthTimelineProps {
  nodes: ReplayNode[];
  onCompare?: (older: JournalEntry, recent: JournalEntry) => void;
  className?: string;
}

export function ReplayGrowthTimeline({ nodes, onCompare, className }: ReplayGrowthTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h2 className="font-serif text-xl font-semibold text-vella-text">Replay Growth</h2>
        <p className="mt-1 text-sm text-vella-muted">
          See how your thinking evolves over time.
        </p>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {nodes.map((node) => (
          <div
            key={node.weekLabel}
            className="flex-shrink-0 w-[280px] snap-start rounded-2xl border-2 border-vella-border bg-vella-bg-card p-4 shadow-[var(--vella-elevation)]"
          >
            <p className="text-xs font-medium text-vella-muted uppercase tracking-wide">
              {node.weekLabel}
            </p>
            <ul className="mt-3 space-y-2">
              {node.entries.slice(0, 3).map((entry) => (
                <li key={entry.id}>
                  <p className="text-sm text-vella-text line-clamp-2">{entry.preview}</p>
                  {entry.tag && (
                    <span className="inline-block mt-1 text-xs text-vella-primary bg-[var(--vella-accent-soft)] px-2 py-0.5 rounded">
                      {entry.tag}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {onCompare && node.entries.length >= 2 && (
              <button
                type="button"
                onClick={() => onCompare(node.entries[node.entries.length - 1], node.entries[0])}
                className="mt-3 w-full text-xs font-medium text-vella-primary hover:underline py-2 rounded-lg hover:bg-[var(--vella-accent-soft)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-vella-primary"
              >
                Compare growth
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
