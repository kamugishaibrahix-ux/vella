"use server";

import type { ConnectionProgress } from "./types";

/**
 * Phase 6A: Progress is stored in behavioural_state_current (Supabase).
 * No .vella/ write. This is a no-op to avoid server file state for progress.
 */
export async function saveProgress(
  _userId: string,
  _metrics: ConnectionProgress,
  _extraData?: Record<string, unknown>,
) {
  // No-op: state lives in behavioural_state_current
}

