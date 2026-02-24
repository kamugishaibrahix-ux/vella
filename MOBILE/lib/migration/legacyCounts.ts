/**
 * Phase M4.5: Legacy content tables dropped from safeTables; no server-side text.
 * has_legacy is false for journals, checkins, conversations, reports (tables no longer queryable).
 * memory_chunks (metadata only, no content column) still queried for migration status.
 */

import { fromSafe } from "@/lib/supabase/admin";

export type HasLegacy = {
  journals: boolean;
  checkins: boolean;
  conversations: boolean;
  reports: boolean;
  memory: boolean;
};

async function hasLegacyMemory(userId: string): Promise<boolean> {
  const { count, error } = await fromSafe("memory_chunks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** M4.5: Legacy content tables removed; only memory_chunks (metadata) still checked. */
export async function getHasLegacy(_userId: string): Promise<HasLegacy> {
  const memory = await hasLegacyMemory(_userId);
  return {
    journals: false,
    checkins: false,
    conversations: false,
    reports: false,
    memory,
  };
}
