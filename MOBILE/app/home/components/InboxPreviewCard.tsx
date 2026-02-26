"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { InboxItem } from "@/lib/execution/types";
import { markDone, snoozeItem, skipItem, deleteItemById } from "@/lib/local/db/inboxRepo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function templateLabel(code: string): string {
  switch (code) {
    case "window_open": return "Window Open";
    case "missed_window": return "Missed Window";
    default: return capitalize(code.replace(/_/g, " "));
  }
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  unread: { bg: "var(--vella-primary-muted)", text: "var(--vella-primary)" },
  snoozed: { bg: "rgba(176, 141, 87, 0.15)", text: "#b08d57" },
  done: { bg: "rgba(107, 143, 110, 0.15)", text: "#6b8f6e" },
  skipped: { bg: "var(--vella-primary-muted)", text: "var(--vella-muted)" },
};

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
// Resolve action sheet
// ---------------------------------------------------------------------------

type ResolveAction = "done" | "snooze" | "skip" | "delete";

function ResolveSheet({
  item,
  onClose,
  onResolved,
}: {
  item: InboxItem;
  onClose: () => void;
  onResolved: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handle = useCallback(
    async (action: ResolveAction) => {
      if (busy) return;
      setBusy(true);
      try {
        switch (action) {
          case "done": {
            await markDone(item.commitment_id, item.window_start_iso);
            break;
          }
          case "snooze": {
            const snoozeUntil = new Date(Date.now() + 60 * 60_000).toISOString();
            await snoozeItem(item.id, snoozeUntil);
            break;
          }
          case "skip": {
            await skipItem(item.id);
            break;
          }
          case "delete": {
            await deleteItemById(item.id);
            break;
          }
        }
        onResolved(item.id);
      } catch {
        // best-effort
      } finally {
        setBusy(false);
        onClose();
      }
    },
    [item, busy, onClose, onResolved],
  );

  const actions: { key: ResolveAction; label: string }[] = [
    { key: "done", label: "Done" },
    { key: "snooze", label: "Snooze 1h" },
    { key: "skip", label: "Skip" },
    { key: "delete", label: "Delete" },
  ];

  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      {actions.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => handle(key)}
          disabled={busy}
          className="px-2.5 py-1 rounded-vella-button text-xs font-medium pressable transition"
          style={{
            background: "var(--vella-primary-muted)",
            color: "var(--vella-primary)",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {label}
        </button>
      ))}
      <button
        onClick={onClose}
        className="px-2.5 py-1 rounded-vella-button text-xs font-medium text-vella-muted transition"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox row
// ---------------------------------------------------------------------------

function InboxRow({
  item,
  onResolved,
}: {
  item: InboxItem;
  onResolved: (id: string) => void;
}) {
  const [showSheet, setShowSheet] = useState(false);
  const style = STATUS_STYLES[item.status] ?? STATUS_STYLES.unread;

  return (
    <div className="py-2.5">
      <div className="flex items-center gap-2">
        {/* Domain badge */}
        <span
          className="shrink-0 inline-block px-2 py-0.5 rounded-vella-pill text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: "var(--vella-primary-muted)", color: "var(--vella-primary)" }}
        >
          {item.domain_code}
        </span>

        {/* Template label */}
        <span className="text-sm font-medium text-vella-text truncate flex-1">
          {templateLabel(item.template_code)}
        </span>

        {/* Status pill */}
        <span
          className="shrink-0 px-2 py-0.5 rounded-vella-pill text-[10px] font-semibold"
          style={{ background: style.bg, color: style.text }}
        >
          {item.status}
        </span>

        {/* Resolve button */}
        {item.status === "unread" && (
          <button
            onClick={() => setShowSheet((p) => !p)}
            className="shrink-0 px-2 py-0.5 rounded-vella-button text-[11px] font-semibold pressable transition"
            style={{ color: "var(--vella-primary)" }}
          >
            Resolve
          </button>
        )}
      </div>

      {showSheet && (
        <ResolveSheet
          item={item}
          onClose={() => setShowSheet(false)}
          onResolved={onResolved}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function InboxPreviewCard({ items }: { items: InboxItem[] }) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const handleResolved = useCallback((id: string) => {
    setResolvedIds((prev) => new Set(prev).add(id));
  }, []);

  // Filter out resolved items and show max 3
  const visible = items
    .filter((i) => !resolvedIds.has(i.id) && (i.status === "unread" || i.status === "snoozed"))
    .slice(0, 3);

  // Group by Today / Earlier
  const today = visible.filter((i) => isToday(i.created_at));
  const earlier = visible.filter((i) => !isToday(i.created_at));

  // Empty state
  if (visible.length === 0) {
    return (
      <section className="rounded-vella-card bg-vella-bg-card p-5" style={{ boxShadow: "var(--vella-elevation)" }}>
        <p className="text-xs font-semibold tracking-wide uppercase text-vella-muted mb-2">
          Your Inbox
        </p>
        <p className="text-sm text-vella-muted">
          Nothing urgent. I&rsquo;ll keep watch.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-vella-card bg-vella-bg-card p-5" style={{ boxShadow: "var(--vella-elevation)" }}>
      <p className="text-xs font-semibold tracking-wide uppercase text-vella-muted mb-2">
        Your Inbox
      </p>

      {today.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-vella-muted mt-2 mb-1">Today</p>
          {today.map((item) => (
            <InboxRow key={item.id} item={item} onResolved={handleResolved} />
          ))}
        </>
      )}

      {earlier.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-vella-muted mt-2 mb-1">Earlier</p>
          {earlier.map((item) => (
            <InboxRow key={item.id} item={item} onResolved={handleResolved} />
          ))}
        </>
      )}

      {/* View all link (not a nav duplicate — goes to dedicated inbox) */}
      {items.filter((i) => i.status === "unread" || i.status === "snoozed").length > 3 && (
        <Link
          href="/inbox"
          className="block mt-3 text-xs font-semibold pressable transition"
          style={{ color: "var(--vella-primary)" }}
        >
          View all →
        </Link>
      )}
    </section>
  );
}
