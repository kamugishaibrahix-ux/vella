"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";

interface JournalEntry {
  id: string;
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function JournalEntryPage() {
  const router = useRouter();
  const params = useParams();
  const entryId = params.id as string;

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // LOCAL-FIRST: read entry from local store
  useEffect(() => {
    const loadEntry = async () => {
      try {
        const { getLocalJournal } = await import("@/lib/local/journalLocal");
        const found = getLocalJournal(undefined, entryId);
        if (found) {
          setEntry({
            id: found.id,
            title: found.title,
            content: found.content,
            createdAt: found.createdAt,
            updatedAt: found.updatedAt,
          });
          setEditContent(found.content);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    };

    loadEntry();
  }, [entryId]);

  const handleSave = useCallback(async () => {
    if (!entry || !editContent.trim()) return;
    setIsSaving(true);

    try {
      // LOCAL-FIRST: update text locally, sync metadata to server
      const { updateLocalJournal } = await import("@/lib/local/journalLocal");
      const result = await updateLocalJournal(undefined, entry.id, {
        content: editContent,
        processingMode: "private",
      });

      if (result) {
        setEntry({
          id: result.entry.id,
          title: result.entry.title,
          content: result.entry.content,
          createdAt: result.entry.createdAt,
          updatedAt: result.entry.updatedAt,
        });
        setIsEditing(false);

        // Sync metadata to server (no text, no title)
        await fetch("/api/journal", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result.meta),
        });
      }
    } finally {
      setIsSaving(false);
    }
  }, [entry, editContent]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-vella-bg">
        <div className="w-6 h-6 border-2 border-vella-border border-t-vella-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-[100dvh] bg-vella-bg px-5 py-6">
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
        <div className="mt-12 flex flex-col items-center justify-center space-y-4">
          <p className="text-vella-muted">Entry not found.</p>
          <button
            type="button"
            onClick={() => router.push("/journal/history")}
            className="text-vella-accent hover:text-vella-accent/80 transition-colors underline"
          >
            View all entries
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto pb-24 bg-vella-bg">
      <div className="px-5 py-6 max-w-2xl mx-auto space-y-6">
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
          <span className="text-[11px] text-vella-muted">{formatDate(entry.createdAt)}</span>
        </header>

        {/* Title */}
        {entry.title && (
          <h1 className="text-xl font-medium text-vella-text">{entry.title}</h1>
        )}

        {/* Content or Edit */}
        {isEditing ? (
          <div className="space-y-4">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={12}
              className={cn(
                "w-full resize-none text-[15px] leading-relaxed text-vella-text placeholder:text-vella-muted/30",
                "bg-vella-bg-card border-2 border-vella-border rounded-xl p-4",
                "focus:outline-none focus:border-vella-accent/50",
                "transition-all duration-200"
              )}
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(entry.content);
                }}
                className="text-[13px] text-vella-muted hover:text-vella-text transition-colors"
              >
                Cancel
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !editContent.trim()}
                  className={cn(
                    "px-5 py-2 text-[13px] font-medium text-white rounded-md bg-vella-text/80 hover:bg-vella-text",
                    "transition-all duration-200",
                    (isSaving || !editContent.trim()) && "opacity-40 pointer-events-none"
                  )}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-vella-bg-card border-2 border-vella-border rounded-xl p-4">
              <p className="text-[15px] leading-relaxed text-vella-text whitespace-pre-wrap">
                {entry.content}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-[13px] text-vella-muted hover:text-vella-text transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
                Edit
              </button>
              <button
                type="button"
                onClick={() => router.push("/journal/history")}
                className="text-[13px] text-vella-muted hover:text-vella-text transition-colors"
              >
                View all entries
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
