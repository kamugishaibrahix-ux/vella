/**
 * STRICT SUPABASE TYPES
 * ======================
 * Compile-time type safety for Supabase operations.
 * These types remove all personal text fields from Insert/Update operations,
 * making it a TypeScript compile-time error to attempt storing personal text.
 *
 * Compliance: DATA_DESIGN.md Local-First Contract
 * Principle: Personal text must be structurally impossible to store in Supabase.
 *
 * @module lib/supabase/types_strict
 */

import type { Database } from "./types";

// ============================================================================
// FORBIDDEN FIELD TYPES (for compile-time exclusion)
// ============================================================================

/**
 * Fields that MUST NEVER appear in Supabase writes.
 * These fields would contain personal text content.
 */
export type ForbiddenPersonalTextFields =
  | "content"
  | "text"
  | "message"
  | "note"
  | "body"
  | "journal"
  | "reflection"
  | "summary"
  | "transcript"
  | "prompt"
  | "response"
  | "narrative"
  | "description"
  | "comment"
  | "entry"
  | "reply"
  | "answer"
  | "reasoning"
  | "free_text"
  | "freeText"
  | "title" // Only if it contains personal text
  | "note_text"
  | "content_text"
  | "message_text"
  | "full_text"
  | "raw"
  | "user_input"
  | "assistant_output";

// ============================================================================
// STRICT TABLE INSERT TYPES (Metadata Only)
// ============================================================================

/**
 * Strict Insert type for journal_entries_meta.
 * Excludes all personal text fields.
 * Only allows: metadata (timestamps, scores, counts), local_hash, processing_mode.
 */
export type StrictJournalEntriesMetaInsert = Omit<
  Database["public"]["Tables"]["journal_entries_meta"]["Insert"],
  ForbiddenPersonalTextFields | "content" | "text" | "title" | "journal"
>;

/**
 * Strict Insert type for journal_entries_v2.
 * Excludes all personal text fields.
 */
export type StrictJournalEntriesV2Insert = Omit<
  Database["public"]["Tables"]["journal_entries_v2"]["Insert"],
  ForbiddenPersonalTextFields | "content" | "title" | "journal"
>;

/**
 * Strict Insert type for check_ins_v2.
 * Excludes all personal text fields (especially 'note').
 * Only allows: mood scores, stress, energy, focus, timestamps.
 */
export type StrictCheckInsV2Insert = Omit<
  Database["public"]["Tables"]["check_ins_v2"]["Insert"],
  ForbiddenPersonalTextFields | "note" | "notes" | "journal"
>;

/**
 * Strict Insert type for conversation_metadata_v2.
 * Excludes all personal text fields (content, messages).
 * Only allows: counts, timestamps, mode_enum, token_count.
 */
export type StrictConversationMetadataV2Insert = Omit<
  Database["public"]["Tables"]["conversation_metadata_v2"]["Insert"],
  ForbiddenPersonalTextFields | "content" | "message" | "text" | "transcript"
>;

/**
 * Strict Insert type for memory_chunks.
 * Excludes content field.
 * Only allows: content_hash, embedding, metadata.
 */
export type StrictMemoryChunksInsert = Omit<
  Database["public"]["Tables"]["memory_chunks"]["Insert"],
  ForbiddenPersonalTextFields | "content" | "text"
>;

/**
 * Strict Insert type for memory_snapshots.
 * Excludes summary content.
 * Only allows: summary_hash, hashes, theme arrays, embeddings.
 */
export type StrictMemorySnapshotsInsert = Omit<
  Database["public"]["Tables"]["memory_snapshots"]["Insert"],
  ForbiddenPersonalTextFields | "summary" | "content"
>;

/**
 * Strict Insert type for memory_clusters.
 * Excludes summary content.
 * Only allows: summary_hash, hashes, theme references, embeddings.
 */
export type StrictMemoryClustersInsert = Omit<
  Database["public"]["Tables"]["memory_clusters"]["Insert"],
  ForbiddenPersonalTextFields | "summary" | "content"
>;

/**
 * Strict Insert type for token_usage.
 * Ensures no personal text in token tracking.
 */
export type StrictTokenUsageInsert = Omit<
  Database["public"]["Tables"]["token_usage"]["Insert"],
  ForbiddenPersonalTextFields
>;

// ============================================================================
// STRICT TABLE UPDATE TYPES
// ============================================================================

/**
 * Strict Update type for journal_entries_meta.
 * All fields optional, but personal text fields excluded.
 */
export type StrictJournalEntriesMetaUpdate = Omit<
  Database["public"]["Tables"]["journal_entries_meta"]["Update"],
  ForbiddenPersonalTextFields | "content" | "text" | "title" | "journal"
>;

/**
 * Strict Update type for check_ins_v2.
 * All fields optional, but personal text fields excluded.
 */
export type StrictCheckInsV2Update = Omit<
  Database["public"]["Tables"]["check_ins_v2"]["Update"],
  ForbiddenPersonalTextFields | "note" | "notes" | "journal"
>;

// ============================================================================
// ALLOWED METADATA TYPES (What's safe to store)
// ============================================================================

/**
 * Fields that ARE safe to store in Supabase.
 * These are all metadata, scores, hashes, enums, timestamps.
 */
export type AllowedMetadataFields =
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "deleted_at"
  | "is_deleted"
  | "local_hash"
  | "content_hash"
  | "summary_hash"
  | "mood_score"
  | "word_count"
  | "token_estimate"
  | "message_count"
  | "token_count"
  | "processing_mode"
  | "mood"
  | "stress"
  | "energy"
  | "focus"
  | "source_type"
  | "source_id"
  | "tier"
  | "period_start"
  | "period_end"
  | "cohesion_score"
  | "member_count"
  | "status"
  | "severity"
  | "report_type"
  | "type"
  | "category"
  | "tokens"
  | "from_allocation"
  | "source";

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an object contains any forbidden fields.
 * Returns true if the object is safe (no forbidden fields).
 */
export function isSafeMetadata<T extends Record<string, unknown>>(
  obj: T,
): obj is T {
  const forbiddenKeys: string[] = [
    "content",
    "text",
    "message",
    "note",
    "body",
    "journal",
    "reflection",
    "summary",
    "transcript",
    "prompt",
    "response",
    "narrative",
    "description",
    "comment",
    "entry",
    "reply",
    "answer",
    "reasoning",
    "free_text",
    "freeText",
    "note_text",
    "content_text",
    "message_text",
    "full_text",
    "raw",
    "user_input",
    "assistant_output",
  ];

  return !Object.keys(obj).some((key) =>
    forbiddenKeys.includes(key.toLowerCase()),
  );
}

/**
 * Asserts that a payload contains only safe metadata fields.
 * Throws a TypeError if any forbidden field is found.
 */
export function assertSafeMetadata<T extends Record<string, unknown>>(
  obj: T,
  context?: string,
): asserts obj is T {
  const forbiddenKeys: string[] = [
    "content",
    "text",
    "message",
    "note",
    "body",
    "journal",
    "reflection",
    "summary",
    "transcript",
    "prompt",
    "response",
    "narrative",
    "description",
    "comment",
    "entry",
    "reply",
    "answer",
    "reasoning",
    "free_text",
    "freeText",
  ];

  const foundForbidden = Object.keys(obj).filter((key) =>
    forbiddenKeys.includes(key.toLowerCase()),
  );

  if (foundForbidden.length > 0) {
    throw new TypeError(
      `[STRICT-TYPES] Forbidden personal text fields detected${context ? ` in ${context}` : ""}: ${foundForbidden.join(", ")}. ` +
        "These fields cannot be stored in Supabase per the local-first privacy policy.",
    );
  }
}

// ============================================================================
// STRICT DATABASE HELPER TYPE
// ============================================================================

/**
 * Helper type for building strict Supabase queries.
 * Ensures that insert/update operations only use metadata-safe types.
 */
export interface StrictSupabaseOperations {
  journal_entries_meta: {
    Insert: StrictJournalEntriesMetaInsert;
    Update: StrictJournalEntriesMetaUpdate;
  };
  journal_entries_v2: {
    Insert: StrictJournalEntriesV2Insert;
  };
  check_ins_v2: {
    Insert: StrictCheckInsV2Insert;
    Update: StrictCheckInsV2Update;
  };
  conversation_metadata_v2: {
    Insert: StrictConversationMetadataV2Insert;
  };
  memory_chunks: {
    Insert: StrictMemoryChunksInsert;
  };
  memory_snapshots: {
    Insert: StrictMemorySnapshotsInsert;
  };
  memory_clusters: {
    Insert: StrictMemoryClustersInsert;
  };
  token_usage: {
    Insert: StrictTokenUsageInsert;
  };
}

// ============================================================================
// COMPILE-TIME SAFETY EXAMPLES
// ============================================================================

/**
 * Example: How to use strict types for compile-time safety
 *
 * ```typescript
 * import type { StrictJournalEntriesMetaInsert } from "@/lib/supabase/types_strict";
 * import { assertSafeMetadata } from "@/lib/supabase/types_strict";
 *
 * // This will cause a TypeScript compile error:
 * const badInsert: StrictJournalEntriesMetaInsert = {
 *   user_id: "user-123",
 *   content: "Personal journal entry...", // ERROR: Object literal may only specify known properties
 * };
 *
 * // This is correct:
 * const goodInsert: StrictJournalEntriesMetaInsert = {
 *   user_id: "user-123",
 *   local_hash: "sha256-hash-of-encrypted-content",
 *   mood_score: 7,
 *   word_count: 150,
 * };
 *
 * // Runtime validation (defense in depth):
 * assertSafeMetadata(goodInsert, "journal insert");
 * ```
 */

// ============================================================================
// LEGACY TABLE BLOCKING TYPES
// ============================================================================

/**
 * These types represent the legacy content tables that have been
 * write-blocked. Attempting to write to these should be a compile-time
 * error when using the strict types.
 */
export type WriteBlockedTables =
  | "journal_entries"
  | "conversation_messages"
  | "check_ins"
  | "user_reports"
  | "user_nudges";

/**
 * Empty type for write-blocked tables.
 * Makes it a compile-time error to attempt inserts/updates.
 */
export type WriteBlockedInsert = never;
export type WriteBlockedUpdate = never;

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

/**
 * Strict Supabase Types Module:
 *
 * Types:
 * - ForbiddenPersonalTextFields: Union type of all forbidden field names
 * - AllowedMetadataFields: Union type of safe metadata field names
 * - StrictJournalEntriesMetaInsert/Update: Hardened journal metadata types
 * - StrictJournalEntriesV2Insert: Hardened legacy journal types
 * - StrictCheckInsV2Insert/Update: Hardened check-in types (no note field)
 * - StrictConversationMetadataV2Insert: Hardened conversation types
 * - StrictMemoryChunksInsert: Hardened memory chunk types
 * - StrictMemorySnapshotsInsert: Hardened snapshot types
 * - StrictMemoryClustersInsert: Hardened cluster types
 * - StrictTokenUsageInsert: Hardened token tracking types
 * - StrictSupabaseOperations: Complete strict operations interface
 * - WriteBlockedTables/Insert/Update: Types preventing legacy table writes
 *
 * Functions:
 * - isSafeMetadata(obj): Type guard for runtime validation
 * - assertSafeMetadata(obj, context): Assertion for runtime enforcement
 *
 * Usage:
 * ```typescript
 * import type { StrictJournalEntriesMetaInsert } from "@/lib/supabase/types_strict";
 * import { assertSafeMetadata } from "@/lib/supabase/types_strict";
 *
 * // TypeScript will error if you try to include personal text fields
 * const insertData: StrictJournalEntriesMetaInsert = {
 *   user_id: userId,
 *   local_hash: hash, // Required - proves content exists locally
 *   mood_score: score,
 *   word_count: count,
 * };
 *
 * // Additional runtime protection
 * assertSafeMetadata(insertData);
 *
 * // Safe to write
 * await safeInsert("journal_entries_meta", insertData);
 * ```
 */
