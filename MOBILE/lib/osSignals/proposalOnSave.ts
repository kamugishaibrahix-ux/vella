/**
 * Proposal-on-save orchestrator — called after journal save (client-side only).
 * Deterministic: reads local journal meta + local focus domains → evaluateProposal → local inbox.
 * No network calls. No journal text leaves device.
 */

import type { FocusDomain } from "@/lib/focusAreas";
import type { OSSignal } from "./taxonomy";
import type { ProposalInboxItem } from "@/lib/execution/types";
import type { Proposal } from "./proposalEngine";
import { incrementSoftStartProposalCount, isSoftStartActive } from "./proposalEngine";
import { readFlag } from "@/lib/local/runtimeFlags";

// ---------------------------------------------------------------------------
// Dependencies injected for testability
// ---------------------------------------------------------------------------

export type ProposalOnSaveDeps = {
  /** Return recent journal entries metadata (last 72h) with their signals. */
  getRecentEntriesMeta: () => Array<{ created_at: string; signals: OSSignal[] }>;
  /** Return user's currently selected focus domains. */
  getSelectedDomains: () => FocusDomain[];
  /** Check if a pending proposal for this domain exists within 72h. */
  hasPendingProposal: (domain: string) => Promise<boolean>;
  /** Write a proposal inbox item to local IndexedDB. */
  addProposalItem: (item: ProposalInboxItem) => Promise<void>;
  /** Evaluate proposal from signals+domains. */
  evaluateProposal: (input: { recentEntriesMeta: Array<{ created_at: string; signals: OSSignal[] }>; selectedDomains: FocusDomain[] }, now?: string) => Proposal | null;
  /** Generate a UUID. */
  generateId: () => string;
  /** Current ISO timestamp (overridable for tests). */
  now?: string;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ProposalOnSaveResult = {
  /** Whether a proposal was created. */
  created: boolean;
  /** The proposal inbox item if created. */
  item: ProposalInboxItem | null;
};

/**
 * Attempt to generate a proposal after journal save.
 * Only runs when processingMode === "signals_only".
 * Returns whether a proposal was created (for UI toast).
 */
export async function maybeCreateProposal(
  deps: ProposalOnSaveDeps,
): Promise<ProposalOnSaveResult> {
  const NONE: ProposalOnSaveResult = { created: false, item: null };

  // 1. Gather inputs
  const recentEntriesMeta = deps.getRecentEntriesMeta();
  const selectedDomains = deps.getSelectedDomains();

  if (!selectedDomains.length || !recentEntriesMeta.length) return NONE;

  // 2. Evaluate proposal
  const proposal = deps.evaluateProposal(
    { recentEntriesMeta, selectedDomains },
    deps.now,
  );
  if (!proposal) return NONE;

  // 3. Dedupe: skip if pending proposal for same domain within 72h
  const isDupe = await deps.hasPendingProposal(proposal.domain);
  if (isDupe) return NONE;

  // 4. Write to local inbox
  const proposalId = deps.generateId();
  const item: ProposalInboxItem = {
    id: `proposal_inbox::${proposalId}`,
    type: "proposal_ready",
    proposal_id: proposalId,
    domain: proposal.domain,
    severity: proposal.severity,
    reason_codes: [...proposal.reasonCodes],
    created_at: deps.now ?? new Date().toISOString(),
    status: "pending",
  };

  await deps.addProposalItem(item);

  // Increment soft-start proposal counter after confirmed local write.
  // Counter is only incremented when soft-start window is still active.
  if (isSoftStartActive(deps.now)) {
    incrementSoftStartProposalCount();
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.debug(
        "[proposalOnSave] soft-start proposal created. domain:",
        item.domain,
        "new count:", readFlag("vella_soft_start_proposal_count"),
      );
    }
  }

  return { created: true, item };
}

// ---------------------------------------------------------------------------
// Default wiring (browser context)
// ---------------------------------------------------------------------------

/**
 * Build default deps from real browser APIs.
 * Only call in client-side code.
 */
export function buildDefaultDeps(userId: string): ProposalOnSaveDeps {
  return {
    getRecentEntriesMeta: () => {
      // Read from localStorage — listLocalJournals returns entries with signals in meta
      const { listLocalJournals } = require("@/lib/local/journalLocal") as typeof import("@/lib/local/journalLocal");
      const { extractSignalsFromJournalText } = require("@/lib/osSignals/journalSignalExtractor") as typeof import("@/lib/osSignals/journalSignalExtractor");
      const entries = listLocalJournals(userId);
      const cutoff = Date.now() - 72 * 60 * 60 * 1000;
      return entries
        .filter((e) => new Date(e.createdAt).getTime() >= cutoff && e.processingMode === "signals_only")
        .map((e) => ({
          created_at: e.createdAt,
          signals: extractSignalsFromJournalText(e.content),
        }));
    },
    getSelectedDomains: () => {
      const { getFocusAreas } = require("@/lib/focusAreas") as typeof import("@/lib/focusAreas");
      return getFocusAreas().map((a) => a.domain);
    },
    hasPendingProposal: async (domain: string) => {
      const { hasPendingProposalForDomain } = require("@/lib/local/db/proposalInboxRepo") as typeof import("@/lib/local/db/proposalInboxRepo");
      return hasPendingProposalForDomain(userId, domain);
    },
    addProposalItem: async (item: ProposalInboxItem) => {
      const { addProposalItem: add } = require("@/lib/local/db/proposalInboxRepo") as typeof import("@/lib/local/db/proposalInboxRepo");
      return add(userId, item);
    },
    evaluateProposal: (input, now) => {
      const { evaluateProposal: evalP } = require("@/lib/osSignals/proposalEngine") as typeof import("@/lib/osSignals/proposalEngine");
      return evalP(input, now);
    },
    generateId: () => crypto.randomUUID(),
  };
}
