/**
 * Map journal enrichment results to behaviour_events (metadata only).
 * No raw text persisted. Only structured codes stored.
 * Call recordEvent() and computeGovernanceState(); no recomputeState (handled by route).
 */

"use server";

import { recordEvent, type SubjectCode } from "@/lib/governance/events";
import { computeGovernanceState } from "@/lib/governance/stateEngine";
import { GOVERNANCE_SUBJECT_CODES } from "@/lib/governance/validation";
import type { JournalEnrichmentPayload } from "@/lib/journal/server";

/** Domain selector value to governance subject_code. */
export const DOMAIN_TO_SUBJECT: Record<string, SubjectCode> = {
  focus: "focus",
  discipline: "habit",
  health: "habit",
  relationships: "other",
  identity: "other",
  general: "other",
};

/** Severity 1–5 from signal count/heuristic. */
function severityFromSignals(count: number): number {
  if (count <= 0) return 1;
  if (count <= 1) return 2;
  if (count <= 2) return 3;
  if (count <= 3) return 4;
  return 5;
}

/** Allowlisted codes for metadata (max 50 chars, alphanumeric + underscore). */
const LOOP_CODES: Record<string, string> = {
  "Late-night anxiety loop": "late_night_anxiety",
  "Avoidance loop": "avoidance_loop",
  "Burnout cycle": "burnout_cycle",
  "Overthinking spiral": "overthinking_spiral",
};
const DISTORTION_CODES: Record<string, string> = {
  "Catastrophising": "catastrophising",
  "All-or-nothing thinking": "all_or_nothing",
  "Emotional reasoning": "emotional_reasoning",
  "MindReading": "mind_reading",
};
const THEME_CODES: Record<string, string> = {
  "Identity & self-worth": "identity_self_worth",
  "Connection & belonging": "connection_belonging",
  "Purpose & direction": "purpose_direction",
  "Energy & capacity": "energy_capacity",
  "Emotional regulation": "emotional_regulation",
};

export type MapJournalToEventsInput = {
  userId: string;
  enrichment: JournalEnrichmentPayload;
  /** Optional domain from UI; maps to subject_code. */
  subjectCode?: SubjectCode | null;
};

/**
 * Records one scheduler_tick per enrichment category with allowlisted metadata.
 * Then recomputes governance_state so risk/discipline/focus reflect new signals.
 */
export async function mapJournalToEvents(input: MapJournalToEventsInput): Promise<{ recorded: number; error?: string }> {
  const { userId, enrichment, subjectCode } = input;
  const subject = subjectCode && GOVERNANCE_SUBJECT_CODES.includes(subjectCode) ? subjectCode : undefined;
  let recorded = 0;

  try {
    if (enrichment.loops?.length) {
      const code = LOOP_CODES[enrichment.loops[0]] ?? "journal_loop";
      const severity = severityFromSignals(enrichment.loops.length);
      const res = await recordEvent(
        userId,
        "scheduler_tick",
        subject ?? undefined,
        undefined,
        { journal_signal: "loop", journal_code: code.slice(0, 50), severity },
      );
      if (res.success) recorded++;
    }
    if (enrichment.distortions?.length) {
      const code = DISTORTION_CODES[enrichment.distortions[0]] ?? "journal_distortion";
      const severity = severityFromSignals(enrichment.distortions.length);
      const res = await recordEvent(
        userId,
        "scheduler_tick",
        subject ?? undefined,
        undefined,
        { journal_signal: "distortion", journal_code: code.slice(0, 50), severity },
      );
      if (res.success) recorded++;
    }
    if (enrichment.themes?.length) {
      const code = THEME_CODES[enrichment.themes[0]] ?? "journal_theme";
      const severity = severityFromSignals(enrichment.themes.length);
      const res = await recordEvent(
        userId,
        "scheduler_tick",
        subject ?? undefined,
        undefined,
        { journal_signal: "theme", journal_code: code.slice(0, 50), severity },
      );
      if (res.success) recorded++;
    }
    if (enrichment.traits?.length) {
      const code = (enrichment.traits[0] ?? "trait").replace(/\s+/g, "_").slice(0, 50);
      const severity = severityFromSignals(enrichment.traits.length);
      const res = await recordEvent(
        userId,
        "scheduler_tick",
        subject ?? undefined,
        undefined,
        { journal_signal: "trait", journal_code: code, severity },
      );
      if (res.success) recorded++;
    }

    const govResult = await computeGovernanceState(userId);
    if (!govResult.success) {
      return { recorded, error: govResult.error };
    }
    return { recorded };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { recorded, error: message };
  }
}
