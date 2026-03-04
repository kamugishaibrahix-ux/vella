/**
 * Proposal Decision Tree — deterministic, no LLM.
 * Converts recent journal signal metadata into a single Proposal or null.
 * Rules (strict mode, default after soft-start expires):
 *   - Only considers user's selectedDomains.
 *   - Triggers if ANY HIGH severity signal in last 24h
 *     OR 2+ MODERATE signals in same domain within 72h.
 *   - No auto-contract creation — proposals require explicit user confirm.
 *
 * Soft-start mode (first 7 days post-onboarding):
 *   - Relaxed threshold: 1 MODERATE in 24h is sufficient.
 *   - Capped at 3 total proposals during the soft-start window.
 *   - Existing 72h per-domain dedupe still enforced (via proposalOnSave).
 *   - Expires automatically when vella_soft_start_until timestamp has passed.
 */

import type { FocusDomain } from "@/lib/focusAreas";
import type { OSSignal, SignalSeverity } from "./taxonomy";
import { readFlag, readISODate, readInt, writeFlag } from "@/lib/local/runtimeFlags";

// ---------------------------------------------------------------------------
// Reason codes — enum strings only, no free text
// ---------------------------------------------------------------------------

export const PROPOSAL_REASON_CODES = [
  "HIGH_SEVERITY_RECENT",
  "MODERATE_CLUSTER_72H",
  "SOFT_START_MODERATE",
] as const;

export type ProposalReasonCode = (typeof PROPOSAL_REASON_CODES)[number];

// ---------------------------------------------------------------------------
// Proposal type
// ---------------------------------------------------------------------------

export type Proposal = {
  id: string;
  domain: FocusDomain;
  severity: SignalSeverity;
  recommendedDurationDays: number; // 3–7
  budgetWeight: number;            // 1–5
  reasonCodes: ProposalReasonCode[];
  created_at: string;
};

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type ProposalInput = {
  recentEntriesMeta: Array<{
    created_at: string;
    signals: OSSignal[];
  }>;
  selectedDomains: FocusDomain[];
};

// ---------------------------------------------------------------------------
// Soft-start window helpers — SSR-safe via runtimeFlags
// ---------------------------------------------------------------------------

export const SOFT_START_KEY = "vella_soft_start_until";
export const SOFT_START_COUNT_KEY = "vella_soft_start_proposal_count";

/** Max proposals allowed during the soft-start window. */
export const SOFT_START_MAX_PROPOSALS = 3;

/**
 * Check whether the soft-start window is currently active.
 * Returns false after the ISO timestamp has passed, if never set, or in SSR.
 * Auto-expires: no deletion required, simply reads and compares.
 */
export function isSoftStartActive(now?: string): boolean {
  const expires = readISODate(SOFT_START_KEY);
  if (!expires) return false;
  const nowMs = now ? new Date(now).getTime() : Date.now();
  return nowMs < expires.getTime();
}

/**
 * Return current soft-start proposal count.
 * Returns 0 in SSR or if never set.
 */
export function getSoftStartProposalCount(): number {
  return readInt(SOFT_START_COUNT_KEY);
}

/**
 * Increment the soft-start proposal counter.
 * Only call after a proposal is successfully created.
 */
export function incrementSoftStartProposalCount(): void {
  const current = getSoftStartProposalCount();
  writeFlag(SOFT_START_COUNT_KEY, String(current + 1));
}

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

const MS_24H = 24 * 60 * 60 * 1000;
const MS_72H = 72 * 60 * 60 * 1000;

function severityWeight(s: SignalSeverity): number {
  if (s === "high") return 3;
  if (s === "moderate") return 2;
  return 1;
}

function durationFromSeverity(s: SignalSeverity): number {
  if (s === "high") return 7;
  if (s === "moderate") return 5;
  return 3;
}

function budgetFromSeverity(s: SignalSeverity): number {
  if (s === "high") return 5;
  if (s === "moderate") return 3;
  return 1;
}

/**
 * Generate a deterministic proposal ID from domain + timestamp.
 * Not a UUID — just a stable, unique-enough key for local dedup.
 */
function proposalId(domain: FocusDomain, now: string): string {
  return `proposal::${domain}::${now}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate recent journal entry metadata and produce a Proposal (or null).
 * Pure, deterministic, no network calls.
 *
 * @param input.recentEntriesMeta  Array of { created_at, signals } from recent journal saves.
 * @param input.selectedDomains    User's currently active FocusDomains.
 * @param now                      Optional override for "now" (ISO string) — for testability.
 */
export function evaluateProposal(
  input: ProposalInput,
  now?: string,
): Proposal | null {
  const { recentEntriesMeta, selectedDomains } = input;
  if (!selectedDomains.length || !recentEntriesMeta.length) return null;

  const nowMs = now ? new Date(now).getTime() : Date.now();
  const cutoff24h = nowMs - MS_24H;
  const cutoff72h = nowMs - MS_72H;

  // Determine soft-start state — reads localStorage, falls back to false in SSR/tests
  const softStart = isSoftStartActive(now);

  // Phase 4: enforce total proposal cap during soft-start window
  if (softStart && getSoftStartProposalCount() >= SOFT_START_MAX_PROPOSALS) {
    return null;
  }

  // Collect all signals from entries within the 72h window, filtered to selectedDomains
  const domainSet = new Set<FocusDomain>(selectedDomains);

  // Track per-domain: high in 24h, moderate count in 72h, moderate in 24h (soft-start only)
  const domainStats = new Map<
    FocusDomain,
    { highIn24h: boolean; moderateCountIn72h: number; moderateIn24h: boolean; maxSeverity: SignalSeverity }
  >();

  for (const entry of recentEntriesMeta) {
    const entryMs = new Date(entry.created_at).getTime();
    if (entryMs < cutoff72h) continue; // older than 72h, skip

    for (const signal of entry.signals) {
      if (!domainSet.has(signal.domain)) continue;

      let stats = domainStats.get(signal.domain);
      if (!stats) {
        stats = { highIn24h: false, moderateCountIn72h: 0, moderateIn24h: false, maxSeverity: "low" };
        domainStats.set(signal.domain, stats);
      }

      // Track max severity
      if (severityWeight(signal.severity) > severityWeight(stats.maxSeverity)) {
        stats.maxSeverity = signal.severity;
      }

      // HIGH in last 24h?
      if (signal.severity === "high" && entryMs >= cutoff24h) {
        stats.highIn24h = true;
      }

      // MODERATE in 72h window (strict rule)
      if (signal.severity === "moderate" || signal.severity === "high") {
        stats.moderateCountIn72h += 1;
      }

      // MODERATE in 24h (soft-start relaxed threshold)
      if (signal.severity === "moderate" && entryMs >= cutoff24h) {
        stats.moderateIn24h = true;
      }
    }
  }

  // Evaluate trigger rules per domain; pick the highest-priority candidate
  type Candidate = {
    domain: FocusDomain;
    severity: SignalSeverity;
    reasons: ProposalReasonCode[];
    score: number; // for deterministic tie-breaking
  };

  const candidates: Candidate[] = [];

  for (const [domain, stats] of Array.from(domainStats.entries())) {
    const reasons: ProposalReasonCode[] = [];

    // Strict rules (always applied)
    if (stats.highIn24h) {
      reasons.push("HIGH_SEVERITY_RECENT");
    }
    if (stats.moderateCountIn72h >= 2) {
      reasons.push("MODERATE_CLUSTER_72H");
    }

    // Soft-start relaxed rule: 1 MODERATE in 24h is sufficient
    // Only fires if strict rules didn't already qualify (avoids duplicate reasons)
    if (softStart && reasons.length === 0 && stats.moderateIn24h) {
      reasons.push("SOFT_START_MODERATE");
    }

    if (reasons.length === 0) continue;

    candidates.push({
      domain,
      severity: stats.maxSeverity,
      reasons,
      score: severityWeight(stats.maxSeverity) * 100 + stats.moderateCountIn72h,
    });
  }

  if (candidates.length === 0) return null;

  // Sort: highest score first, then alphabetical domain for determinism
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.domain.localeCompare(b.domain);
  });

  const best = candidates[0];
  const nowIso = now ?? new Date(nowMs).toISOString();

  return {
    id: proposalId(best.domain, nowIso),
    domain: best.domain,
    severity: best.severity,
    recommendedDurationDays: durationFromSeverity(best.severity),
    budgetWeight: budgetFromSeverity(best.severity),
    reasonCodes: best.reasons,
    created_at: nowIso,
  };
}
