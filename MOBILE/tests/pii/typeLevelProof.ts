/**
 * TYPE-LEVEL PROOF - SHOULD FAIL TYPE CHECKING
 * ===========================================
 * This file attempts to use forbidden fields in Supabase operations.
 * It should FAIL TypeScript compilation because:
 * - Strict types remove personal text fields from Insert/Update types
 * - safeInsert/safeUpdate enforce these constraints at compile time
 *
 * This file is intentionally designed to produce type errors.
 * DO NOT FIX THE ERRORS - they prove the type system is working.
 */

import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type {
  StrictJournalEntriesMetaInsert,
  StrictCheckInsV2Insert,
  StrictMemoryChunksInsert,
} from "@/lib/supabase/types_strict";

// ============================================================================
// ATTEMPT 1: Direct forbidden field in safeInsert (should fail)
// ============================================================================

// Try to insert content into journal_entries_meta - should fail
safeInsert("journal_entries_meta", {
  user_id: "user_123",
  content: "Personal journal text that should not be allowed", // ERROR: content not in strict type
  local_hash: "abc123",
});

// Try to insert text field - should fail
safeInsert("journal_entries_meta", {
  user_id: "user_123",
  text: "Personal text content", // ERROR: text not allowed
  mood_score: 7,
  local_hash: "abc123",
});

// Try to insert message field - should fail
safeInsert("journal_entries_meta", {
  user_id: "user_123",
  message: "Secret message", // ERROR: message not allowed
  local_hash: "abc123",
});

// Try to insert note field - should fail
safeInsert("journal_entries_meta", {
  user_id: "user_123",
  note: "Private note", // ERROR: note not allowed
  local_hash: "abc123",
});

// ============================================================================
// ATTEMPT 2: Strict type assignment (should fail)
// ============================================================================

// Try to assign object with forbidden fields to strict type
const badJournalInsert: StrictJournalEntriesMetaInsert = {
  user_id: "user_123",
  content: "Personal content via strict type", // ERROR: content doesn't exist in strict type
  local_hash: "abc123",
  mood_score: 5,
  word_count: 100,
};

// Try to assign check-in with note
const badCheckInInsert: StrictCheckInsV2Insert = {
  user_id: "user_123",
  note: "Personal check-in note", // ERROR: note not allowed
  mood: 7,
  stress: 3,
  energy: 6,
  focus: 8,
};

// Try to assign memory chunk with content
const badMemoryInsert: StrictMemoryChunksInsert = {
  user_id: "user_123",
  content: "Memory content that should be blocked", // ERROR: content not allowed
  content_hash: "hash123",
};

// ============================================================================
// ATTEMPT 3: Nested structures (should fail)
// ============================================================================

// Try nested object with content
safeInsert("journal_entries_meta", {
  user_id: "user_123",
  local_hash: "abc123",
  signals: {
    content: "Nested content attack", // ERROR: signals should be structured JSONB only
    nested: {
      message: "Deep nested message", // ERROR: deeply nested content
    },
  },
});

// ============================================================================
// ATTEMPT 4: Update operations (should fail)
// ============================================================================

// Try to update with content
safeUpdate("journal_entries_meta", {
  content: "Updated personal content", // ERROR: content not allowed in update
});

// Try to update with text
safeUpdate("check_ins_v2", {
  note: "Updated note", // ERROR: note not allowed in update
});

// ============================================================================
// ATTEMPT 5: Array attacks (should fail)
// ============================================================================

// Try array with forbidden fields
safeInsert("journal_entries_meta", [
  {
    user_id: "user_1",
    local_hash: "hash1",
    content: "Bulk insert content 1", // ERROR
  },
  {
    user_id: "user_2",
    local_hash: "hash2",
    content: "Bulk insert content 2", // ERROR
  },
]);

// ============================================================================
// ATTEMPT 6: Legacy tables (should fail)
// ============================================================================

// Try to write to blocked legacy tables
safeInsert("journal_entries", {
  user_id: "user_123",
  content: "Legacy table content", // ERROR: table is write-blocked AND type has no content
  title: "Journal Entry",
});

safeInsert("conversation_messages", {
  user_id: "user_123",
  content: "Message content", // ERROR: write-blocked table
});

safeInsert("check_ins", {
  user_id: "user_123",
  note: "Check-in note", // ERROR: write-blocked table
});

// ============================================================================
// ATTEMPT 7: Variations of forbidden keys (should fail)
// ============================================================================

safeInsert("journal_entries_meta", {
  user_id: "user_123",
  local_hash: "abc123",
  summary: "Personal summary", // ERROR
  transcript: "Voice transcript", // ERROR
  prompt: "User prompt", // ERROR
  response: "AI response", // ERROR
  narrative: "Life narrative", // ERROR
  description: "Detailed description", // ERROR
  comment: "Personal comment", // ERROR
  entry: "Diary entry", // ERROR
  reply: "Thread reply", // ERROR
  answer: "Question answer", // ERROR
  reasoning: "My reasoning", // ERROR
  free_text: "Unrestricted text", // ERROR
  freeText: "CamelCase text", // ERROR
});

// ============================================================================
// ATTEMPT 8: Semantic smuggling (should fail)
// ============================================================================

safeInsert("journal_entries_meta", {
  user_id: "user_123",
  local_hash: "abc123",
  detail: "Detailed personal info", // ERROR: semantic smuggling vector
  details: "More details", // ERROR
  context: "Personal context", // ERROR
  notes: "Multiple notes", // ERROR
  note_text: "Note text field", // ERROR
  raw: "Raw personal data", // ERROR
  payload: "Payload with data", // ERROR
});

console.log("If you see this file without TypeScript errors, the type system is broken!");
