"use server";

/**
 * Phase 6A: Connection depth is stored in behavioural_state_current (Supabase).
 * No .vella/ write. This is a no-op to avoid server file state for connection_depth.
 */
export async function saveConnectionDepth(_userId: string, _depth: number) {
  // No-op: state lives in behavioural_state_current
}

