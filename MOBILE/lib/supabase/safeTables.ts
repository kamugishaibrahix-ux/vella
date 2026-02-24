// SAFE-DATA PATCH D / M4.5: Metadata-only storage. Legacy content tables (journal_entries, check_ins, conversation_messages, user_reports) removed.

import type { Database } from "./types";

const SAFE_TABLE_VALUES = [
  "achievements",
  "admin_ai_config",
  "admin_user_flags",
  "abstinence_targets",
  "behaviour_events",
  "behavioural_state_current",
  "behavioural_state_history",
  "check_ins_v2",
  "commitments",
  "connection_depth",
  "conversation_metadata_v2",
  "feedback",
  "focus_sessions",
  "governance_state",
  "journal_entries_v2",
  "last_active",
  "memory_chunks",
  "memory_chunks_v2",
  "memory_embed_jobs",
  "micro_rag_cache",
  "migration_audit",
  "migration_export_audit",
  "migration_state",
  "profiles",
  "progress_metrics",
  "prompt_signatures",
  "social_models",
  "subscriptions",
  "system_logs",
  "token_rates",
  "token_topups",
  "token_usage",
  "user_goal_actions",
  "user_goals",
  "user_metadata",
  "user_preferences",
  "user_reports_v2",
  "webhook_events",
  "vella_personality",
  "vella_settings",
] as const;

export type SafeTableName = Extract<(typeof SAFE_TABLE_VALUES)[number], keyof Database["public"]["Tables"]>;
export const SAFE_TABLES = SAFE_TABLE_VALUES as readonly SafeTableName[];

export function assertSafeTable(table: string): asserts table is SafeTableName {
  if (SAFE_TABLES.includes(table as SafeTableName)) {
    return;
  }
  const message = `[SAFE-DATA] Forbidden Supabase table used: ${table}`;
  if (process.env.NODE_ENV !== "production") {
    console.warn(message);
  }
  throw new Error(message);
}


