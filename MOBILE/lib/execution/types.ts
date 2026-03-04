/**
 * Execution Spine — Layer 2 Types (Phase 1)
 * Domain enums, commitment metadata, outcome types.
 * All server-safe: no free-text fields.
 */

// ---------------------------------------------------------------------------
// Domain codes (what area of life)
// ---------------------------------------------------------------------------

export const COMMITMENT_DOMAIN_CODES = [
  "sleep",
  "focus",
  "routine",
  "fitness",
  "abstinence",
  "social",
  "other",
] as const;

export type CommitmentDomainCode = (typeof COMMITMENT_DOMAIN_CODES)[number];

// ---------------------------------------------------------------------------
// Cadence types (Phase 1: recurring + deadline only)
// ---------------------------------------------------------------------------

export const CADENCE_TYPES = ["recurring", "deadline"] as const;

export type CadenceType = (typeof CADENCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Target types
// ---------------------------------------------------------------------------

export const TARGET_TYPES = ["count", "duration", "boolean", "completion"] as const;

export type TargetType = (typeof TARGET_TYPES)[number];

// ---------------------------------------------------------------------------
// Commitment status (lifecycle dimension — stored)
// ---------------------------------------------------------------------------

export const COMMITMENT_STATUSES = ["active", "paused", "completed", "abandoned"] as const;

export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Outcome codes
// ---------------------------------------------------------------------------

export const OUTCOME_CODES = ["completed", "skipped", "missed"] as const;

export type OutcomeCode = (typeof OUTCOME_CODES)[number];

// ---------------------------------------------------------------------------
// Server-safe commitment metadata (Supabase)
// ---------------------------------------------------------------------------

export type CommitmentMetadata = {
  id: string;
  user_id: string;
  commitment_code: string;
  subject_code: CommitmentDomainCode;
  target_type: TargetType;
  target_value: number;
  cadence_type: CadenceType;
  status: CommitmentStatus;
  start_at: string;
  end_at: string | null;
  deadline_at: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Client-only local record (IndexedDB, encrypted)
// ---------------------------------------------------------------------------

export type CommitmentLocal = {
  id: string; // commitment_id (PK)
  userId: string;
  description_encrypted: string;
  motivation_encrypted: string | null;
  notes_encrypted: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Outcome event metadata (written to behaviour_events.metadata)
// ---------------------------------------------------------------------------

export type OutcomeEventMetadata = {
  outcome_code: OutcomeCode;
  commitment_id: string;
  window_start?: string;
  window_end?: string;
};

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

export type CreateCommitmentPayload = {
  commitment_code: string;
  subject_code: CommitmentDomainCode;
  target_type: TargetType;
  target_value: number;
  cadence_type: CadenceType;
  start_at: string;
  end_at?: string | null;
  deadline_at?: string | null;
};

export type LogOutcomePayload = {
  commitment_id: string;
  outcome_code: OutcomeCode;
  occurred_at_iso?: string;
  window_start_iso?: string;
  window_end_iso?: string;
};

export type ChangeStatusPayload = {
  commitment_id: string;
  new_status: "paused" | "active" | "completed" | "abandoned";
};

// ---------------------------------------------------------------------------
// Phase 2 — Trigger Engine types
// ---------------------------------------------------------------------------

export const TRIGGER_TYPES = ["window_open"] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

/** A computed schedule window for a commitment. */
export type ScheduleWindow = {
  commitment_id: string;
  window_start: Date;
  window_end: Date;
};

/** Client-side trigger state (persisted in memory/localStorage). */
export type TriggerState = {
  /** Idempotency key: `${commitment_id}::${window_start_iso}` */
  last_fired_key: string;
  last_fired_at: string; // ISO
};

/** Guardrail configuration — resolved from prefs or defaults. */
export type GuardrailConfig = {
  max_triggers_per_day: number;
  cooldown_minutes: number;
  quiet_hours_start: number | null; // hour 0-23 or null (disabled)
  quiet_hours_end: number | null;   // hour 0-23 or null (disabled)
};

/** Canonical idempotency key for trigger events (deterministic string). */
export type IdempotencyKey = string;

/** Metadata payload written to behaviour_events for trigger_fired. */
export type TriggerFireMetadata = {
  commitment_id: string;
  domain_code: string;
  trigger_type: TriggerType;
  window_start_iso: string;
  window_end_iso: string;
  idempotency_key: IdempotencyKey;
};

// ---------------------------------------------------------------------------
// Phase 2.1 — Trigger suppression + local inbox
// ---------------------------------------------------------------------------

export const SUPPRESSION_REASON_CODES = [
  "quiet_hours",
  "max_triggers_per_day",
  "cooldown",
  "no_active_window",
  "outside_window",
  "already_fired",
] as const;

export type SuppressionReasonCode = (typeof SUPPRESSION_REASON_CODES)[number];

/** Metadata payload written to behaviour_events for trigger_suppressed. */
export type TriggerSuppressedMetadata = {
  commitment_id: string;
  domain_code: string;
  trigger_type: TriggerType;
  window_start_iso: string;
  reason_code: SuppressionReasonCode;
  idempotency_key: IdempotencyKey;
};

export const TEMPLATE_CODES = ["window_open", "missed_window"] as const;

export type TemplateCode = (typeof TEMPLATE_CODES)[number];

export type InboxItemStatus = "unread" | "done" | "snoozed" | "skipped";

/** Local-only inbox item stored in IndexedDB. */
export type InboxItem = {
  id: string;
  created_at: string;
  commitment_id: string;
  domain_code: string;
  template_code: TemplateCode;
  window_start_iso: string;
  window_end_iso?: string;
  status: InboxItemStatus;
  snooze_until?: string; // ISO timestamp — scheduler ignores until this time
};

// ---------------------------------------------------------------------------
// Phase 2.2 — Proposal inbox items (OS-signal pipeline)
// ---------------------------------------------------------------------------

export const PROPOSAL_INBOX_STATUSES = ["pending", "confirmed", "dismissed"] as const;
export type ProposalInboxStatus = (typeof PROPOSAL_INBOX_STATUSES)[number];

/** Local-only proposal inbox item stored in IndexedDB. No free text. */
export type ProposalInboxItem = {
  id: string;
  type: "proposal_ready";
  proposal_id: string;
  domain: string;
  severity: "low" | "moderate" | "high";
  reason_codes: string[];
  created_at: string;
  status: ProposalInboxStatus;
};

/** Union of all inbox item shapes for the local store. */
export type AnyInboxItem = InboxItem | ProposalInboxItem;
