"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Inbox as InboxIcon,
  Check,
  Clock,
  SkipForward,
  Trash2,
  ChevronDown,
  ChevronUp,
  Activity,
  AlertCircle,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ensureUserId } from "@/lib/local/ensureUserId";
import {
  listItems,
  addItem as addInboxItem,
  markDone,
  snoozeItem,
  skipItem,
  deleteItemById,
} from "@/lib/local/db/inboxRepo";
import {
  listProposalItems,
  addProposalItem,
  updateProposalStatus,
  deleteProposalItem,
} from "@/lib/local/db/proposalInboxRepo";
import type { InboxItem, ProposalInboxItem } from "@/lib/execution/types";
import { addLocalBehaviourEvent } from "@/lib/local/behaviourEventsLocal";

// ---------------------------------------------------------------------------
// Enum-only label maps — no free text, no journal content
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

const PROPOSAL_DOMAIN_COLORS: Record<string, string> = {
  "self-mastery": "bg-violet-100 text-violet-700",
  "addiction-recovery": "bg-purple-100 text-purple-700",
  "emotional-intelligence": "bg-blue-100 text-blue-700",
  "relationships": "bg-pink-100 text-pink-700",
  "performance-focus": "bg-amber-100 text-amber-700",
  "identity-purpose": "bg-teal-100 text-teal-700",
  "physical-health": "bg-emerald-100 text-emerald-700",
  "financial-discipline": "bg-orange-100 text-orange-700",
};

/** Reason code → human-readable label. Enum-only. No free text. */
const REASON_CODE_LABELS: Record<string, string> = {
  HIGH_SEVERITY_RECENT: "High intensity detected",
  MODERATE_CLUSTER_72H: "Pattern forming over 72h",
};

/** Severity → visual weight config. No alarming colors. Subtle hierarchy. */
const SEVERITY_CONFIG: Record<string, { label: string; dotClass: string; borderClass: string; labelClass: string }> = {
  high: {
    label: "High",
    dotClass: "bg-rose-400",
    borderClass: "border-l-2 border-rose-300",
    labelClass: "text-rose-600 bg-rose-50",
  },
  moderate: {
    label: "Moderate",
    dotClass: "bg-amber-400",
    borderClass: "border-l-2 border-amber-300",
    labelClass: "text-amber-700 bg-amber-50",
  },
  low: {
    label: "Low",
    dotClass: "bg-stone-300",
    borderClass: "border-l-2 border-stone-200",
    labelClass: "text-stone-500 bg-stone-50",
  },
};

const STATUS_PILLS: Record<string, { label: string; className: string }> = {
  unread: { label: "New", className: "bg-vella-primary/15 text-vella-primary" },
  done: { label: "Done", className: "bg-emerald-100 text-emerald-700" },
  snoozed: { label: "Snoozed", className: "bg-amber-100 text-amber-700" },
  skipped: { label: "Skipped", className: "bg-stone-100 text-stone-500" },
};

const PROPOSAL_STATUS_PILLS: Record<string, { label: string; className: string }> = {
  pending: { label: "New", className: "bg-vella-primary/15 text-vella-primary" },
  confirmed: { label: "Confirmed", className: "bg-emerald-100 text-emerald-700" },
  dismissed: { label: "Dismissed", className: "bg-stone-100 text-stone-500" },
};

// ---------------------------------------------------------------------------
// Server feed item types (from GET /api/inbox)
// ---------------------------------------------------------------------------

type TransitionFeedItem = {
  kind: "system_transition";
  created_at: string;
  payload: {
    id: string;
    previous_phase: string;
    new_phase: string;
    triggered_by_domain: string;
    trigger_source: string;
    change_flags: {
      phase_changed: boolean;
      priority_changed: boolean;
      enforcement_changed: boolean;
      constraint_level_changed: boolean;
    };
  };
};

type ContractFeedItem = {
  kind: "contract_created";
  created_at: string;
  payload: {
    id: string;
    domain: string;
    severity: string;
    enforcement_mode: string;
    expires_at: string;
    is_active: boolean;
  };
};

type ServerFeedItem = TransitionFeedItem | ContractFeedItem;

// ---------------------------------------------------------------------------
// Severity sort weight
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHT: Record<string, number> = { high: 3, moderate: 2, low: 1 };

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

function windowExpiry(windowEndIso?: string): string | null {
  if (!windowEndIso) return null;
  const diff = new Date(windowEndIso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h left`;
}

// ---------------------------------------------------------------------------
// Outcome logger — POST to existing /api/commitments/outcome
// ---------------------------------------------------------------------------

async function logOutcome(
  commitmentId: string,
  outcomeCode: "completed" | "skipped",
  windowStartIso?: string,
  windowEndIso?: string,
): Promise<void> {
  try {
    await fetch("/api/commitments/outcome", {
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
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Proposal confirm — POST to /api/session/confirm-contract
// ---------------------------------------------------------------------------

type ConfirmResult =
  | { ok: true; contractId: string }
  | { ok: false; code: string };

async function confirmProposalAsContract(
  domain: string,
  severity: string,
): Promise<ConfirmResult> {
  const durationDays = severity === "high" ? 7 : severity === "moderate" ? 5 : 3;
  const budgetWeight = severity === "high" ? 5 : severity === "moderate" ? 3 : 1;

  try {
    const res = await fetch("/api/session/confirm-contract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ domain, severity, duration_days: durationDays, budget_weight: budgetWeight }),
    });
    if (res.ok) {
      const json = await res.json();
      return { ok: true, contractId: json.contractId };
    }
    const json = await res.json().catch(() => ({}));
    return { ok: false, code: (json as Record<string, string>).code ?? "UNKNOWN" };
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
}

// ---------------------------------------------------------------------------
// Section wrapper with collapse
// ---------------------------------------------------------------------------

function SectionBlock({
  icon,
  title,
  count,
  children,
  defaultOpen = true,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mb-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 mb-3 pressable"
        aria-expanded={open}
      >
        <span className="text-vella-muted">{icon}</span>
        <span className="text-xs font-semibold text-vella-muted uppercase tracking-wider flex-1 text-left">
          {title}
        </span>
        {count > 0 && (
          <span className="text-xs font-semibold bg-vella-primary/15 text-vella-primary px-2 py-0.5 rounded-full min-w-[20px] text-center">
            {count}
          </span>
        )}
        {open ? (
          <ChevronUp className="w-4 h-4 text-vella-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-vella-muted" />
        )}
      </button>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Active Commitment Card
// ---------------------------------------------------------------------------

function CommitmentCard({
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
  const expiryLabel = windowExpiry(item.window_end_iso);

  const handleDone = async () => {
    setBusy(true);
    const parts = item.id.split("::");
    if (parts.length >= 2) {
      await markDone(parts[0], parts.slice(1).join("::"));
    }
    await logOutcome(item.commitment_id, "completed", item.window_start_iso, item.window_end_iso);
    addLocalBehaviourEvent({
      event_type: "commitment_completed",
      subject_code: item.domain_code,
      occurred_at: new Date().toISOString(),
    }).catch(() => {});
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
    addLocalBehaviourEvent({
      event_type: "commitment_violation",
      subject_code: item.domain_code,
      occurred_at: new Date().toISOString(),
    }).catch(() => {});
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
        "bg-vella-bg-card rounded-[var(--vella-radius-card)] p-4 shadow-[var(--vella-elevation)] border border-vella-border/60 transition-all",
        isDone && "opacity-55",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", domainColor)}>
          {item.domain_code}
        </span>
        <span className="text-sm font-semibold text-vella-text flex-1">{templateLabel}</span>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusPill.className)}>
          {statusPill.label}
        </span>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-vella-muted">{relativeTime(item.created_at)}</span>
        {expiryLabel && (
          <span className={cn(
            "text-xs font-medium",
            expiryLabel === "Expired" ? "text-rose-500" : "text-amber-600",
          )}>
            · {expiryLabel}
          </span>
        )}
      </div>

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
// Section 2 — Monitoring Proposal Card
// ---------------------------------------------------------------------------

function ProposalCard({
  item,
  onAction,
}: {
  item: ProposalInboxItem;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const domainColor = PROPOSAL_DOMAIN_COLORS[item.domain] ?? "bg-stone-100 text-stone-600";
  const statusPill = PROPOSAL_STATUS_PILLS[item.status] ?? PROPOSAL_STATUS_PILLS.pending;
  const severityCfg = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.low;
  const isDone = item.status === "confirmed" || item.status === "dismissed";

  const handleConfirm = async () => {
    setBusy(true);
    setConfirmError(null);
    const result = await confirmProposalAsContract(item.domain, item.severity);
    if (result.ok) {
      await updateProposalStatus(item.id, "confirmed");
      onAction();
    } else {
      // Surface blocked reasons as structured codes, not free text
      const BLOCKED_CODES: Record<string, string> = {
        DUPLICATE_CONTRACT: "Active contract exists for this domain.",
        WEEKLY_CAP_REACHED: "Weekly contract limit reached.",
        OBSERVE_MODE_BLOCK: "System is in observe mode.",
        DOMAIN_NOT_SELECTED: "Domain not in active focus areas.",
      };
      // DEV-ONLY: Log exact error code for debugging
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.debug("[INBOX] Confirm failed:", result.code);
      }
      setConfirmError(BLOCKED_CODES[result.code] ?? "Could not create contract. Try again.");
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    setBusy(true);
    await updateProposalStatus(item.id, "dismissed");
    onAction();
  };

  const handleDelete = async () => {
    setBusy(true);
    await deleteProposalItem(item.id);
    onAction();
  };

  return (
    <div
      className={cn(
        "bg-vella-bg-card rounded-[var(--vella-radius-card)] p-4 shadow-[var(--vella-elevation)] border border-vella-border/40 transition-all",
        severityCfg.borderClass,
        isDone && "opacity-55",
      )}
    >
      {/* Top row */}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", domainColor)}>
          {item.domain.replace(/-/g, " ")}
        </span>
        {/* Severity badge */}
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1", severityCfg.labelClass)}>
          <span className={cn("inline-block w-1.5 h-1.5 rounded-full", severityCfg.dotClass)} />
          {severityCfg.label}
        </span>
        <span className="flex-1" />
        <span className="text-xs text-vella-muted">{relativeTime(item.created_at)}</span>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusPill.className)}>
          {statusPill.label}
        </span>
      </div>

      {/* Reason tags — enum codes only, no raw signals */}
      {item.reason_codes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.reason_codes.map((code) => (
            <span
              key={code}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-vella-bg text-vella-muted border border-vella-border/60"
            >
              {REASON_CODE_LABELS[code] ?? code}
            </span>
          ))}
        </div>
      )}

      {/* Confirm error */}
      {confirmError && (
        <p className="text-xs text-rose-500 mb-2">{confirmError}</p>
      )}

      {!isDone && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--vella-radius-button)] bg-vella-primary text-white text-sm font-medium pressable disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            Confirm
          </button>
          <button
            onClick={handleDismiss}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--vella-radius-button)] bg-vella-bg text-vella-muted-strong text-sm font-medium border border-vella-border pressable disabled:opacity-50"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Dismiss
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
// Section 3 — System State Card (informational, no actions)
// ---------------------------------------------------------------------------

const TRANSITION_CHANGE_LABELS: Record<string, string> = {
  phase_changed: "Phase transition",
  priority_changed: "Priority shift",
  enforcement_changed: "Enforcement mode change",
  constraint_level_changed: "Constraint level change",
};

function SystemTransitionCard({ item }: { item: TransitionFeedItem }) {
  const changes = Object.entries(item.payload.change_flags)
    .filter(([, v]) => v)
    .map(([k]) => TRANSITION_CHANGE_LABELS[k] ?? k);

  return (
    <div className="bg-vella-bg-card rounded-[var(--vella-radius-card)] p-4 border border-vella-border/30 shadow-[var(--vella-elevation)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-vella-muted px-2 py-0.5 rounded-full bg-vella-bg border border-vella-border/50">
          {item.payload.triggered_by_domain.replace(/-/g, " ")}
        </span>
        <span className="flex-1" />
        <span className="text-xs text-vella-muted">{relativeTime(item.created_at)}</span>
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-medium text-vella-muted-strong">
          {item.payload.previous_phase}
        </span>
        <span className="text-xs text-vella-muted">→</span>
        <span className="text-xs font-semibold text-vella-text">
          {item.payload.new_phase}
        </span>
      </div>
      {changes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {changes.map((c) => (
            <span
              key={c}
              className="text-[11px] text-vella-muted px-1.5 py-0.5 rounded bg-vella-bg border border-vella-border/40"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractCreatedCard({ item }: { item: ContractFeedItem }) {
  const severityCfg = SEVERITY_CONFIG[item.payload.severity] ?? SEVERITY_CONFIG.low;
  const domainColor = PROPOSAL_DOMAIN_COLORS[item.payload.domain] ?? "bg-stone-100 text-stone-600";
  const expiresLabel = item.payload.expires_at
    ? `Expires ${relativeTime(item.payload.expires_at)}`
    : null;

  return (
    <div className="bg-vella-bg-card rounded-[var(--vella-radius-card)] p-4 border border-vella-border/30 shadow-[var(--vella-elevation)]">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full capitalize", domainColor)}>
          {item.payload.domain.replace(/-/g, " ")}
        </span>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1", severityCfg.labelClass)}>
          <span className={cn("inline-block w-1.5 h-1.5 rounded-full", severityCfg.dotClass)} />
          {severityCfg.label}
        </span>
        <span className="flex-1" />
        <span className="text-xs text-vella-muted">{relativeTime(item.created_at)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
          Contract active
        </span>
        {expiresLabel && (
          <span className="text-xs text-vella-muted">{expiresLabel}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox Page
// ---------------------------------------------------------------------------

export default function InboxPage() {
  const router = useRouter();
  const [commitmentItems, setCommitmentItems] = useState<InboxItem[]>([]);
  const [proposalItems, setProposalItems] = useState<ProposalInboxItem[]>([]);
  const [serverItems, setServerItems] = useState<ServerFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  // DEV-ONLY: Build verification banner (never rendered in production)
  const isDev = process.env.NODE_ENV === "development";
  const buildId = typeof window !== "undefined" ? "INBOX_V2_ACTIVE" : "INBOX_SSR";

  const loadItems = useCallback(async () => {
    try {
      const userId = ensureUserId();
      const [localCommitments, localProposals] = await Promise.all([
        listItems(userId),
        listProposalItems(userId),
      ]);
      setCommitmentItems(localCommitments);
      setProposalItems(localProposals);
      // DEV-ONLY: Debug trace (no user text)
      if (isDev) {
        // eslint-disable-next-line no-console
        console.debug("[INBOX] Loaded from IndexedDB:", {
          commitments: localCommitments.length,
          proposals: localProposals.length,
        });
      }
    } catch (e) {
      // IndexedDB unavailable — silent
      if (isDev) {
        // eslint-disable-next-line no-console
        console.debug("[INBOX] IndexedDB load error:", e);
      }
    }

    // Load server feed (system transitions + contract events)
    try {
      const res = await fetch("/api/inbox", { credentials: "include" });
      if (res.ok) {
        const json = await res.json() as { ok: boolean; items: Array<{ type: string; created_at: string; payload: Record<string, unknown> }> };
        const mapped: ServerFeedItem[] = (json.items ?? []).flatMap((item): ServerFeedItem[] => {
          if (item.type === "system_transition") {
            return [{
              kind: "system_transition" as const,
              created_at: item.created_at,
              payload: item.payload as TransitionFeedItem["payload"],
            }];
          }
          if (item.type === "contract_created") {
            return [{
              kind: "contract_created" as const,
              created_at: item.created_at,
              payload: item.payload as ContractFeedItem["payload"],
            }];
          }
          return [];
        });
        setServerItems(mapped);
        if (isDev) {
          // eslint-disable-next-line no-console
          console.debug("[INBOX] Server feed items:", mapped.length);
        }
      }
    } catch (e) {
      // Server feed optional — silent
      if (isDev) {
        // eslint-disable-next-line no-console
        console.debug("[INBOX] Server feed error:", e);
      }
    }

    setLoading(false);
  }, [isDev]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // ── Section 1: Active Commitments ──────────────────────────────────────
  // Active = unread OR snoozed (within window). Sort by soonest window expiry first.
  const activeCommitments = commitmentItems
    .filter((i) => i.status === "unread" || i.status === "snoozed")
    .sort((a, b) => {
      const aEnd = a.window_end_iso ? new Date(a.window_end_iso).getTime() : Infinity;
      const bEnd = b.window_end_iso ? new Date(b.window_end_iso).getTime() : Infinity;
      return aEnd - bEnd;
    });

  const resolvedCommitments = commitmentItems.filter(
    (i) => i.status === "done" || i.status === "skipped",
  );

  // ── Section 2: Monitoring Proposals ────────────────────────────────────
  // Only pending. Sort by severity desc.
  const pendingProposals = proposalItems
    .filter((i) => i.status === "pending")
    .sort((a, b) => (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0));

  const resolvedProposals = proposalItems.filter(
    (i) => i.status === "confirmed" || i.status === "dismissed",
  );

  // ── Section 3: System State ─────────────────────────────────────────────
  // Newest first.
  const stateItems = [...serverItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // ── Unread count (header badge) ────────────────────────────────────────
  const unreadCount = activeCommitments.length + pendingProposals.length;

  const isEmpty =
    !loading &&
    activeCommitments.length === 0 &&
    pendingProposals.length === 0 &&
    resolvedCommitments.length === 0 &&
    resolvedProposals.length === 0 &&
    stateItems.length === 0;

  // DEV-ONLY: Seeder helpers (defined after loadItems, unreachable in production)
  const seedCommitment = async () => {
    if (!isDev) return;
    const userId = ensureUserId();
    const now = new Date();
    const windowStart = new Date(now.getTime() + 5 * 60 * 1000); // 5 min from now
    const windowEnd = new Date(now.getTime() + 25 * 60 * 1000); // 25 min from now
    const commitmentId = `seed-${Date.now()}`;
    const windowStartIso = windowStart.toISOString();
    const item: InboxItem = {
      id: `${commitmentId}::${windowStartIso}`,
      created_at: now.toISOString(),
      commitment_id: commitmentId,
      domain_code: "focus",
      template_code: "window_open",
      window_start_iso: windowStartIso,
      window_end_iso: windowEnd.toISOString(),
      status: "unread",
    };
    await addInboxItem(userId, item);
    // eslint-disable-next-line no-console
    console.debug("[INBOX] Seeded commitment:", item.id);
    await loadItems();
  };

  const seedProposal = async () => {
    if (!isDev) return;
    const userId = ensureUserId();
    const now = new Date();
    const proposalId = `seed-prop-${Date.now()}`;
    const item: ProposalInboxItem = {
      id: `proposal_inbox::${proposalId}`,
      type: "proposal_ready",
      proposal_id: proposalId,
      domain: "self-mastery",
      severity: "moderate",
      reason_codes: ["MODERATE_CLUSTER_72H"],
      created_at: now.toISOString(),
      status: "pending",
    };
    await addProposalItem(userId, item);
    // eslint-disable-next-line no-console
    console.debug("[INBOX] Seeded proposal:", item.id);
    await loadItems();
  };

  const clearInbox = async () => {
    if (!isDev) return;
    const userId = ensureUserId();
    const [commitments, proposals] = await Promise.all([
      listItems(userId),
      listProposalItems(userId),
    ]);
    await Promise.all([
      ...commitments.map((c) => deleteItemById(c.id)),
      ...proposals.map((p) => deleteProposalItem(p.id)),
    ]);
    // eslint-disable-next-line no-console
    console.debug("[INBOX] Cleared:", { commitments: commitments.length, proposals: proposals.length });
    await loadItems();
  };

  return (
    <div className="flex flex-col min-h-screen pb-6">
      {/* DEV-ONLY: Runtime verification banner */}
      {isDev && (
        <div className="bg-amber-100 border-b border-amber-300 px-3 py-1.5 text-[11px] font-mono text-amber-800">
          <div className="flex items-center gap-2">
            <span className="font-bold">[DEV]</span>
            <span>Route: /inbox</span>
            <span>·</span>
            <span>Build: {buildId}</span>
            <span>·</span>
            <span>{new Date().toISOString().slice(0, 19)}Z</span>
          </div>
        </div>
      )}

      {/* DEV-ONLY: Seeder controls (unreachable in production) */}
      {isDev && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono text-amber-700 font-bold">[DEV TOOLS]</span>
            <button
              onClick={seedCommitment}
              className="px-2 py-1 text-[11px] font-medium bg-white border border-amber-300 rounded text-amber-800 hover:bg-amber-100"
            >
              Seed Commitment
            </button>
            <button
              onClick={seedProposal}
              className="px-2 py-1 text-[11px] font-medium bg-white border border-amber-300 rounded text-amber-800 hover:bg-amber-100"
            >
              Seed Proposal
            </button>
            <button
              onClick={clearInbox}
              className="px-2 py-1 text-[11px] font-medium bg-white border border-rose-300 rounded text-rose-700 hover:bg-rose-50"
            >
              Clear Inbox
            </button>
          </div>
        </div>
      )}

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
            <h1 className="text-lg font-semibold text-vella-text">Follow-Up</h1>
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

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <InboxIcon className="w-12 h-12 text-vella-muted/40 mb-3" />
            <p className="text-vella-muted text-sm">All clear.</p>
            <p className="text-vella-muted/70 text-xs mt-1">
              Vella will surface follow-ups as your commitments and signals accumulate.
            </p>
          </div>
        )}

        {!loading && (
          <>
            {/* ── Section 1: Active Commitments ─────────────────── */}
            {(activeCommitments.length > 0 || resolvedCommitments.length > 0) && (
              <SectionBlock
                icon={<Activity className="w-4 h-4" />}
                title="Active Commitments"
                count={activeCommitments.length}
              >
                {activeCommitments.map((item) => (
                  <CommitmentCard key={item.id} item={item} onAction={loadItems} />
                ))}
                {resolvedCommitments.map((item) => (
                  <CommitmentCard key={item.id} item={item} onAction={loadItems} />
                ))}
              </SectionBlock>
            )}

            {/* ── Section 2: Monitoring Proposals ───────────────── */}
            {(pendingProposals.length > 0 || resolvedProposals.length > 0) && (
              <SectionBlock
                icon={<AlertCircle className="w-4 h-4" />}
                title="Monitoring Proposals"
                count={pendingProposals.length}
              >
                {pendingProposals.map((item) => (
                  <ProposalCard key={item.id} item={item} onAction={loadItems} />
                ))}
                {resolvedProposals.map((item) => (
                  <ProposalCard key={item.id} item={item} onAction={loadItems} />
                ))}
              </SectionBlock>
            )}

            {/* ── Section 3: System State ────────────────────────── */}
            {stateItems.length > 0 && (
              <SectionBlock
                icon={<GitBranch className="w-4 h-4" />}
                title="System State"
                count={0}
                defaultOpen={false}
              >
                {stateItems.map((item) =>
                  item.kind === "system_transition" ? (
                    <SystemTransitionCard key={item.payload.id} item={item} />
                  ) : (
                    <ContractCreatedCard key={item.payload.id} item={item} />
                  ),
                )}
              </SectionBlock>
            )}
          </>
        )}
      </div>
    </div>
  );
}
