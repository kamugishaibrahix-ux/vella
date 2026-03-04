"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { JournalEntryCard } from "@/app/components/journal/JournalEntryCard";
import type { JournalEntry } from "@/app/components/journal/types";

type JournalListResponse = { entries?: JournalEntry[] };

const fetcher = async (_key: string): Promise<JournalListResponse> => {
  // LOCAL-FIRST: read journal entries from on-device store
  const { listLocalJournals } = await import("@/lib/local/journalLocal");
  const locals = listLocalJournals(undefined);
  const entries: JournalEntry[] = locals.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    modeId: "free-write" as const,
    modeLabel: "Free Write",
    title: e.title ?? "Untitled",
    preview: e.content.slice(0, 120),
    sharedWithVella: e.processingMode === "signals_only",
    freeText: e.content,
  }));
  return { entries };
};

// Search icon
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

// Filter button
function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-[11px] rounded-full transition-all duration-200",
        active
          ? "bg-vella-text text-white"
          : "bg-vella-bg-card text-vella-muted hover:bg-vella-bg hover:text-vella-text"
      )}
    >
      {label}
    </button>
  );
}

export default function SavedPage() {
  const router = useRouter();
  const { data, isLoading } = useSWR<JournalListResponse>("/api/journal", fetcher);
  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);

  const [searchQuery, setSearchQuery] = useState("");
  const [modeFilter, setModeFilter] = useState<string | "all">("all");

  // Get unique modes for filter
  const availableModes = useMemo(() => {
    const modes = new Set<string>();
    entries.forEach((e) => {
      if (e.modeLabel) modes.add(e.modeLabel);
    });
    return Array.from(modes);
  }, [entries]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = [...entries].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((e) =>
        (e.title?.toLowerCase().includes(query) ?? false) ||
        (e.preview?.toLowerCase().includes(query) ?? false) ||
        (e.freeText?.toLowerCase().includes(query) ?? false)
      );
    }

    // Mode filter
    if (modeFilter !== "all") {
      result = result.filter((e) => e.modeLabel === modeFilter);
    }

    return result;
  }, [entries, searchQuery, modeFilter]);

  const handleEdit = useCallback((entry: JournalEntry) => {
    // Navigate to entry detail/edit view
    router.push(`/journal/${entry.id}` as any);
  }, [router]);

  const handleDelete = useCallback((entry: JournalEntry) => {
    // TODO: Implement delete confirmation and API call
    console.log("Delete entry:", entry.id);
  }, []);

  return (
    <div className="min-h-[100dvh] overflow-y-auto pb-24 bg-vella-bg">
      <div className="px-5 py-6 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-[13px] text-vella-muted hover:text-vella-text transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-[14px] font-medium text-vella-text tracking-wide uppercase">Saved</h1>
          <div className="w-16" />
        </header>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vella-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className={cn(
              "w-full pl-10 pr-4 py-3 text-[14px]",
              "bg-vella-bg-card rounded-xl border-2 border-vella-border",
              "placeholder:text-vella-muted",
              "focus:outline-none focus:border-vella-accent/50",
              "transition-all duration-200"
            )}
          />
        </div>

        {/* Filters */}
        {availableModes.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <FilterButton
              label="All"
              active={modeFilter === "all"}
              onClick={() => setModeFilter("all")}
            />
            {availableModes.map((mode) => (
              <FilterButton
                key={mode}
                label={mode}
                active={modeFilter === mode}
                onClick={() => setModeFilter(mode)}
              />
            ))}
          </div>
        )}

        {/* Results count */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-vella-muted">
            {filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"}
          </span>
          {(searchQuery || modeFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setModeFilter("all");
              }}
              className="text-[11px] text-vella-muted hover:text-vella-text transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Entry list */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-vella-border border-t-vella-accent rounded-full animate-spin" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-vella-bg-card flex items-center justify-center">
                <SearchIcon className="w-5 h-5 text-vella-muted" />
              </div>
              <p className="text-[13px] text-vella-muted">
                {entries.length === 0 ? "No entries yet." : "No entries match your filters."}
              </p>
              {entries.length === 0 && (
                <button
                  type="button"
                  onClick={() => router.push("/journal")}
                  className="text-[13px] text-vella-accent hover:text-vella-accent/80 transition-colors underline"
                >
                  Write your first entry
                </button>
              )}
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
