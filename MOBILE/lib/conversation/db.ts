/**
 * Phase M4.5: Conversation. NORMAL reads: conversation_metadata_v2 only.
 * Legacy conversation_messages dropped from safeTables; export returns 410.
 * Hybrid Coupling v1: mode_enum accepts VellaMode (vent | listen | challenge | coach | crisis).
 */

import { fromSafe, supabaseAdmin } from "@/lib/supabase/admin";
import { safeInsert } from "@/lib/safe/safeSupabaseWrite";
import type { Database } from "@/lib/supabase/types";
import type { VellaMode } from "@/lib/ai/modes";

type InsertMetaV2 = Database["public"]["Tables"]["conversation_metadata_v2"]["Insert"];

export type ConversationMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  session_id: string | null;
  created_at: string;
};

/** Normal path: v2 has no message content; return empty list. */
export async function listConversationMessagesFromDb(
  _userId: string,
  _limit = 100,
  _sessionId?: string | null
): Promise<ConversationMessageRow[]> {
  return [];
}

/** Normal path: count from v2 metadata (sum of message_count). */
export async function getConversationMessageCount(userId: string): Promise<number> {
  const { data, error } = await fromSafe("conversation_metadata_v2")
    .select("message_count")
    .eq("user_id", userId);
  if (error) throw error;
  const rows = (data ?? []) as { message_count: number }[];
  return rows.reduce((sum, r) => sum + (r.message_count ?? 0), 0);
}

/** M4.5: Legacy conversation_messages dropped from safeTables; always false. */
export async function hasLegacyConversationData(_userId: string): Promise<boolean> {
  return false;
}

/** M4.5: Legacy export disabled; schema dropped. Returns empty (caller should return 410). */
export async function listConversationMessagesLegacyForExport(
  _userId: string,
  _opts: { limit: number; offset: number }
): Promise<ConversationMessageRow[]> {
  return [];
}

/** Phase 0: Legacy write blocked. */
export async function insertConversationMessage(
  _userId: string,
  _message: { role: "user" | "assistant"; content: string; session_id?: string | null }
): Promise<ConversationMessageRow> {
  throw new Error("[SAFE-DATA] conversation_messages is write-blocked. Use recordConversationMetadataV2.");
}

export async function recordConversationMetadataV2(opts: {
  userId: string;
  messageCount: number;
  tokenCount: number;
  modelId?: string | null;
  mode_enum?: VellaMode | null;
}): Promise<void> {
  if (!supabaseAdmin) throw new Error("Supabase admin not configured.");
  const insert: InsertMetaV2 = {
    user_id: opts.userId,
    started_at: new Date().toISOString(),
    ended_at: null,
    mode_enum: opts.mode_enum ?? "listen",
    message_count: opts.messageCount,
    token_count: opts.tokenCount,
    model_id: opts.modelId ?? null,
  };
  const { error } = await safeInsert(
    "conversation_metadata_v2",
    insert as Record<string, unknown>,
    undefined,
    supabaseAdmin
  );
  if (error) throw error;
}
