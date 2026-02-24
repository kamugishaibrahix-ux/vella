/**
 * Behaviour Event Engine (append-only).
 * Deterministic event recording. No updates, no deletes.
 * Does not integrate with UI, goals, or reflection.
 */

"use server";

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import {
  validateGovernancePayload,
  GOVERNANCE_EVENT_TYPES,
  GOVERNANCE_SUBJECT_CODES,
} from "@/lib/governance/validation";

type BehaviourEventRow = Database["public"]["Tables"]["behaviour_events"]["Row"];
type BehaviourEventInsert = Database["public"]["Tables"]["behaviour_events"]["Insert"];

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

/** Event type must be one of the governance allowlist. */
export type EventType = (typeof GOVERNANCE_EVENT_TYPES)[number];

/** Subject code must be one of the governance allowlist. */
export type SubjectCode = (typeof GOVERNANCE_SUBJECT_CODES)[number];

/** Metadata values: number, code string, or ISO timestamp only. No free-text. */
export type MetadataCodeValue = number | string;

export type ListEventsFilters = {
  /** Filter by event_type (must be valid enum). */
  event_type?: EventType;
  /** Inclusive start of occurred_at range (ISO string). */
  from?: string;
  /** Inclusive end of occurred_at range (ISO string). */
  to?: string;
  /** Max number of events to return (1–500). Default 50. */
  limit?: number;
};

export type RecordEventResult =
  | { success: true; id: string }
  | { success: false; error: string };

/**
 * Record a single behaviour event. Append-only; no updates or deletes.
 * Validates via governance validation layer and rejects invalid enum values.
 * Optional occurredAt: ISO string (used for weekly_focus_checkin date); otherwise now.
 */
export async function recordEvent(
  userId: string,
  eventType: EventType,
  subjectCode?: SubjectCode | null,
  numericValue?: number | null,
  metadataCode?: Record<string, MetadataCodeValue> | null,
  occurredAt?: string | null
): Promise<RecordEventResult> {
  const occurred_at = (occurredAt && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(occurredAt))
    ? occurredAt
    : new Date().toISOString();
  const metadata_code = {
    ...(numericValue !== undefined && numericValue !== null && { numeric_value: numericValue }),
    ...(metadataCode && typeof metadataCode === "object" ? metadataCode : {}),
  };
  const payload = {
    user_id: userId,
    event_type: eventType,
    occurred_at,
    ...(subjectCode != null && { subject_code: subjectCode }),
    ...(Object.keys(metadata_code).length > 0 && { metadata_code }),
  };

  let validated: {
    user_id: string;
    event_type: EventType;
    occurred_at: string;
    commitment_id?: string;
    subject_code?: SubjectCode;
    metadata_code?: Record<string, number | string>;
  };
  try {
    validated = validateGovernancePayload("BehaviourEventInsert", payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }

  const row: BehaviourEventInsert = {
    user_id: validated.user_id,
    event_type: validated.event_type,
    occurred_at: validated.occurred_at,
    ...(validated.commitment_id != null && { commitment_id: validated.commitment_id }),
    ...(validated.subject_code != null && { subject_code: validated.subject_code }),
    metadata: (validated.metadata_code ?? {}) as Database["public"]["Tables"]["behaviour_events"]["Row"]["metadata"],
  };

  if (!supabaseAdmin) {
    return { success: false, error: "Supabase admin not configured." };
  }
  const { data, error } = await safeInsert("behaviour_events", row, undefined, supabaseAdmin).select("id").single();

  if (error) {
    return { success: false, error: error.message };
  }
  if (!data?.id) {
    return { success: false, error: "Insert did not return id" };
  }
  return { success: true, id: data.id };
}

/**
 * List behaviour events for a user. Append-only store: no updates or deletes.
 * Rejects invalid event_type enum in filters.
 */
export async function listEvents(
  userId: string,
  filters?: ListEventsFilters
): Promise<{ events: BehaviourEventRow[]; error?: string }> {
  const limit = Math.min(
    Math.max(filters?.limit ?? DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT
  );

  if (filters?.event_type != null && !GOVERNANCE_EVENT_TYPES.includes(filters.event_type)) {
    return { events: [], error: "Invalid event_type in filters" };
  }

  let query = fromSafe("behaviour_events")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (filters?.event_type != null) {
    query = query.eq("event_type", filters.event_type);
  }
  if (filters?.from != null && filters.from !== "") {
    query = query.gte("occurred_at", filters.from);
  }
  if (filters?.to != null && filters.to !== "") {
    query = query.lte("occurred_at", filters.to);
  }

  const { data, error } = await query;

  if (error) {
    return { events: [], error: error.message };
  }
  const events = (data ?? []) as BehaviourEventRow[];
  return { events };
}
