/**
 * TYPE-LEVEL PROOF - SHOULD PASS TYPE CHECKING
 * ============================================
 * This file uses only safe, allowed fields in Supabase operations.
 * It should PASS TypeScript compilation because:
 * - All fields are metadata-only (ids, hashes, enums, numbers, timestamps)
 * - No personal text fields are used
 * - Strict types allow these fields
 */

import { safeInsert, safeUpdate } from "@/lib/safe/safeSupabaseWrite";
import type {
  StrictJournalEntriesMetaInsert,
  StrictCheckInsV2Insert,
  StrictMemoryChunksInsert,
  StrictConversationMetadataV2Insert,
} from "@/lib/supabase/types_strict";

// ============================================================================
// VALID 1: Metadata-only journal insert (should pass)
// ============================================================================

// Valid insert with only metadata
safeInsert("journal_entries_meta", {
  user_id: "user_123",
  local_hash: "a3f5c8d9e2b1a4f7c6d8e9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9",
  word_count: 150,
  processing_mode: "private",
  signals: { trigger: "morning_routine", intensity: 3 },
});

// Valid strict type assignment
const validJournalInsert: StrictJournalEntriesMetaInsert = {
  user_id: "user_123",
  local_hash: "sha256_hash_of_encrypted_content_here",
  word_count: 100,
  processing_mode: "private",
};

// ============================================================================
// VALID 2: Check-in with scores only (should pass)
// ============================================================================

// Valid check-in with metadata only (no note field)
safeInsert("check_ins_v2", {
  user_id: "user_123",
  mood_score: 7,
  stress: 3,
  energy: 6,
  focus: 8,
});

const validCheckInInsert: StrictCheckInsV2Insert = {
  user_id: "user_123",
  mood_score: 5,
  stress: 4,
  energy: 7,
  focus: 6,
};

// ============================================================================
// VALID 3: Memory chunk with hash only (should pass)
// ============================================================================

// Valid memory chunk insert (content stored locally, hash in DB)
safeInsert("memory_chunks", {
  user_id: "user_123",
  content_hash: "hash_of_encrypted_memory_content",
  source_type: "journal",
  source_id: "journal_456",
  embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
  embedding_model: "text-embedding-3-small",
  token_estimate: 50,
});

const validMemoryInsert: StrictMemoryChunksInsert = {
  user_id: "user_123",
  content_hash: "sha256_content_hash",
  source_type: "checkin",
  source_id: "checkin_789",
};

// ============================================================================
// VALID 4: Conversation metadata (should pass)
// ============================================================================

// Valid conversation metadata (messages stored locally)
safeInsert("conversation_metadata_v2", {
  user_id: "user_123",
  message_count: 5,
  token_count: 250,
  mode_enum: "standard",
  model_id: "gpt-4",
});

const validConversationInsert: StrictConversationMetadataV2Insert = {
  user_id: "user_123",
  message_count: 3,
  token_count: 150,
};

// ============================================================================
// VALID 5: Update operations with safe fields (should pass)
// ============================================================================

// Valid update with metadata only
safeUpdate("journal_entries_meta", {
  word_count: 200,
});

safeUpdate("check_ins_v2", {
  mood_score: 6,
  stress: 2,
  energy: 7,
  focus: 9,
});

// ============================================================================
// VALID 6: Batch inserts (should pass)
// ============================================================================

// Valid batch insert with metadata only
safeInsert("journal_entries_meta", [
  {
    user_id: "user_1",
    local_hash: "hash1abc123def456",
    word_count: 150,
  },
  {
    user_id: "user_2",
    local_hash: "hash2ghi789jkl012",
    word_count: 100,
  },
]);

// ============================================================================
// VALID 7: Enums and flags (should pass)
// ============================================================================

safeInsert("journal_entries_meta", {
  user_id: "user_123",
  local_hash: "abc123",
  processing_mode: "private", // enum value
});

// ============================================================================
// VALID 8: JSONB structured data (should pass)
// ============================================================================

safeInsert("journal_entries_meta", {
  user_id: "user_123",
  local_hash: "abc123",
  signals: { trigger: "evening_reflection", confidence: 0.85 }, // structured, not free text
});

// ============================================================================
// VALID 9: Null values for optional fields (should pass)
// ============================================================================

safeInsert("journal_entries_meta", {
  user_id: "user_123",
  local_hash: "abc123",
  word_count: null,
});

// ============================================================================
// VALID 10: Numbers, booleans, short strings (should pass)
// ============================================================================

safeInsert("check_ins_v2", {
  user_id: "user_123",
  mood_score: 5,
  stress: 3,
  energy: 7,
  focus: 6,
  // is_deleted defaults to false
});

console.log("Type-level proof OK: All operations use only safe metadata fields");
