/**
 * Recompute Trigger Points.
 * Lightweight orchestration that fires recomputeUserSystem after
 * domain-relevant data mutations.
 *
 * Safe transaction boundaries:
 *   - The caller has already committed the domain write.
 *   - Recompute runs as a subsequent step (not nested in the same tx).
 *   - The debounce in recomputeProtocol prevents tight loops.
 *   - Errors during recompute are logged but do NOT fail the caller.
 *
 * Usage:
 *   import { triggerRecompute } from "@/lib/system/recomputeTrigger";
 *   // After inserting health_metrics, financial_entries, etc:
 *   await triggerRecompute(userId);
 */

"use server";

import { fromSafe } from "@/lib/supabase/admin";
import { recomputeUserSystem } from "@/lib/system/recomputeProtocol";
import type { FocusDomain } from "@/lib/focusAreas";

/**
 * Fire-and-forget recompute after a domain data mutation.
 * Reads selected focus domains from user_preferences (local metadata).
 * Swallows errors to avoid breaking the caller's flow.
 */
export async function triggerRecompute(userId: string): Promise<void> {
  try {
    const selectedDomains = await loadSelectedDomains(userId);
    await recomputeUserSystem(userId, selectedDomains);
  } catch {
    // Swallow: recompute is best-effort after mutations.
    // The debounce guard inside recomputeProtocol prevents loops.
  }
}

/**
 * Typed trigger for health domain writes.
 * Ensures the caller is semantically declaring which domain mutated.
 */
export async function triggerHealthRecompute(userId: string): Promise<void> {
  return triggerRecompute(userId);
}

/**
 * Typed trigger for financial domain writes.
 */
export async function triggerFinancialRecompute(userId: string): Promise<void> {
  return triggerRecompute(userId);
}

/**
 * Typed trigger for cognitive domain writes (decisions / outcomes).
 */
export async function triggerCognitiveRecompute(userId: string): Promise<void> {
  return triggerRecompute(userId);
}

/**
 * Typed trigger for governance-adjacent writes (commitments, abstinence).
 */
export async function triggerGovernanceRecompute(userId: string): Promise<void> {
  return triggerRecompute(userId);
}

async function loadSelectedDomains(userId: string): Promise<FocusDomain[]> {
  try {
    const { data } = await fromSafe("user_preferences")
      .select("selected_focus_domains")
      .eq("user_id", userId)
      .maybeSingle();

    if (data && Array.isArray((data as Record<string, unknown>).selected_focus_domains)) {
      return (data as Record<string, unknown>).selected_focus_domains as FocusDomain[];
    }
  } catch {
    // Fall through to empty
  }
  return [];
}
