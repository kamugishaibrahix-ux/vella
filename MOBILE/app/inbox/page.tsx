"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Inbox as InboxIcon, Check, Clock, SkipForward, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ensureUserId } from "@/lib/local/ensureUserId";
import {
  listItems,
  markDone,
  snoozeItem,
  skipItem,
  deleteItemById,
} from "@/lib/local/db/inboxRepo";
import type { InboxItem } from "@/lib/execution/types";

// ---------------------------------------------------------------------------
// Domain badge colors
// ---------------------------------------------------------------------------

const DOMAIN_COLORS: Record<string, string> = {
  sleep: "bg-indigo-100 text-indigo-700",
  focus: "bg-amber-100 text-amber-700",
  routine: "bg-emerald-100 text-emerald-700",
  fitness: "bg-rose-100 text-rose-700",
  abstinence: "bg-purple-100 text-purple-700",
  social: "bg-sky-100 text-sky-700",
  other: "bg-stone-100 text-stone-600",
};

const TEMPLATE_LABELS: Record<string, string> = {
  window_open: "Time to act",
  missed_window: "Missed window",
};

const STATUS_PILLS: Record<string, { label: string; className: string }> = {
  unread: { label: "New", className: "bg-vella-primary/15 text-vella-primary" },
  done: { label: "Done", className: "bg-emerald-100 text-emerald-700" },
  snoozed: { label: "Snoozed", className: "bg-amber-100 text-amber-700" },
  skipped: { label: "Skipped", className: "bg-stone-100 text-stone-500" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ---------------------------------------------------------------------------
// Outcome logger (client POST to existing API)
// ---------------------------------------------------------------------------

async function logOutcome(
  commitmentId: string,
  outcomeCode: "completed" | "skipped",
  windowStartIso?: string,
  windowEndIso?: string
): Promise<boolean> {
  try {
    const res = await fetch("/api/commitments/outcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        commitment_id: commitmentId,
        outcome_code: outcomeCode,
        ...(windowStartIso && { window_start_iso: windowStartIso }),
        ...(windowEndIso && { window_end_iso: windowEndIso }),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Inbox Card
// ---------------------------------------------------------------------------

function InboxCard({
  item,
  onAction,
}: {
  item: InboxItem;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const domainColor = DOMAIN_COLORS[item.domain_code] ?? DOMAIN_COLORS.other;
  const templateLabel = TEMPLATE_LABELS[item.template_code] ?? item.template_code;
  const statusPill = STATUS_PILLS[item.status] ?? STATUS_PILLS.unread;
  const isDone = item.status === "done" || item.status === "skipped";

  const handleDone = async () => {
    setBusy(true);
    const parts = item.id.split("::");
    if (parts.length >= 2) {
      await markDone(parts[0], parts.slice(1).join("::"));
    }
    await logOutcome(item.commitment_id, "completed", item.window_start_iso, item.window_end_iso);
    onAction();
  };

  const handleSnooze = async () => {
    setBusy(true);
    const snoozeUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    await snoozeItem(item.id, snoozeUntil);
    onAction();
  };

  const handleSkip = async () => {
    setBusy(true);
    await skipItem(item.id);
    await logOutcome(item.commitment_id, "skipped", item.window_start_iso, item.window_end_iso);
    onAction();
  };

  const handleDelete = async () => {
    setBusy(true);
    await deleteItemById(item.id);
    onAction();
  };

  return (
    <div
      className={cn(
        "bg-vella-bg-card rounded-[var(--vella-radius-card)] p-4 shadow-[var(--vella-elevation)] border border-vella-border/40 transition-all",
        isDone && "opacity-60"
      )}
    >
      {/* Top row: badge + template + time + status */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full capitalize",
            domainColor
          )}
        >
          {item.domain_code}
        </span>
        <span className="text-sm font-medium text-vella-text flex-1">
          {templateLabel}
        </span>
        <span className="text-xs text-vella-muted">
          {relativeTime(item.created_at)}
        </span>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            statusPill.className
          )}
        >
          {statusPill.label}
        </span>
      </div>

      {/* Actions */}
      {!isDone && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleDone}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--vella-radius-button)] bg-vella-primary text-white text-sm font-medium pressable disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            Done
          </button>
          <button
            onClick={handleSnooze}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--vella-radius-button)] bg-vella-bg text-vella-muted-strong text-sm font-medium border border-vella-border pressable disabled:opacity-50"
          >
            <Clock className="w-3.5 h-3.5" />
            10m
          </button>
          <button
            onClick={handleSkip}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--vella-radius-button)] bg-vella-bg text-vella-muted-strong text-sm font-medium border border-vella-border pressable disabled:opacity-50"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="ml-auto p-1.5 rounded-[var(--vella-radius-button)] text-vella-muted hover:text-rose-500 pressable disabled:opacity-50"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox Page
// ---------------------------------------------------------------------------

export default function InboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    try {
      const userId = ensureUserId();
      const all = await listItems(userId);
      // Unread first, then by created_at desc
      const sorted = [...all].sort((a, b) => {
        const aUnread = a.status === "unread" || a.status === "snoozed" ? 0 : 1;
        const bUnread = b.status === "unread" || b.status === "snoozed" ? 0 : 1;
        if (aUnread !== bUnread) return aUnread - bUnread;
        return b.created_at.localeCompare(a.created_at);
      });
      setItems(sorted);
    } catch {
      // IndexedDB unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const unreadCount = items.filter(
    (i) => i.status === "unread" || i.status === "snoozed"
  ).length;

  const todayItems = items.filter((i) => isToday(i.created_at));
  const earlierItems = items.filter((i) => !isToday(i.created_at));

  return (
    <div className="flex flex-col min-h-screen pb-6">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-vella-bg/95 backdrop-blur-sm px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 border-b border-vella-border/40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 pressable"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-vella-text" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <InboxIcon className="w-5 h-5 text-vella-primary" />
            <h1 className="text-lg font-semibold text-vella-text">Inbox</h1>
            {unreadCount > 0 && (
              <span className="text-xs font-semibold bg-vella-primary text-white px-2 py-0.5 rounded-full min-w-[20px] text-center">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 pt-4">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-vella-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <InboxIcon className="w-12 h-12 text-vella-muted/40 mb-3" />
            <p className="text-vella-muted text-sm">Nothing here yet.</p>
            <p className="text-vella-muted/70 text-xs mt-1">
              Inbox items appear when your commitments are due.
            </p>
          </div>
        )}

        {!loading && todayItems.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-vella-muted uppercase tracking-wider mb-3">
              Today
            </h2>
            <div className="flex flex-col gap-3">
              {todayItems.map((item) => (
                <InboxCard key={item.id} item={item} onAction={loadItems} />
              ))}
            </div>
          </section>
        )}

        {!loading && earlierItems.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-vella-muted uppercase tracking-wider mb-3">
              Earlier
            </h2>
            <div className="flex flex-col gap-3">
              {earlierItems.map((item) => (
                <InboxCard key={item.id} item={item} onAction={loadItems} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
