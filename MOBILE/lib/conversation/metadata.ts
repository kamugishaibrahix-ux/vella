/**
 * CONVERSATION METADATA CONTRACT
 * ===============================
 * Single source of truth for the metadata shape passed to the PII firewall
 * and ultimately stored in conversation_metadata_v2.
 *
 * All keys are snake_case to satisfy the PII firewall safe-compound rules.
 *
 * @module lib/conversation/metadata
 */

/** Input shape accepted from callers (camelCase for ergonomics). */
export interface ConversationMetadataInput {
  userId: string;
  sessionId: string | null;
  mode: string | null;
  language: string;
  messageLength: number;
}

/** Output shape: snake_case keys safe for PII firewall and Supabase writes. */
export interface ConversationMetadataPayload {
  user_id: string;
  session_id: string | null;
  mode_enum: string | null;
  language: string;
  message_count: number;
}

/**
 * Builds a snake_case conversation metadata payload from caller-friendly input.
 * The returned object is safe to pass directly to assertNoPII() and safeInsert().
 */
export function buildConversationMetadata(
  input: ConversationMetadataInput,
): ConversationMetadataPayload {
  return {
    user_id: input.userId,
    session_id: input.sessionId,
    mode_enum: input.mode,
    language: input.language,
    message_count: input.messageLength,
  };
}
