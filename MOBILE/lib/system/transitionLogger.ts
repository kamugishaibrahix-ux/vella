/**
 * System Transition Logger.
 * Deterministic comparison of previous vs new system snapshots.
 * Inserts into system_transition_log only when a meaningful change occurred.
 *
 * No AI. No free text. Pure enum/boolean/id writes.
 */

"use server";

import { safeInsert } from "@/lib/safe/safeSupabaseWrite";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ConstraintLevel } from "@/lib/system/resourceBudgetEngine";
import type { SystemPhase } from "@/lib/system/phaseEngine";
import type { RiskDomain } from "@/lib/system/masterStateEngine";
import type { EnforcementMode } from "@/lib/system/priorityEngine";

export type TriggerSource =
  | "session_close"
  | "scheduler_tick"
  | "user_action"
  | "system_recompute";

export interface TransitionSnapshot {
  phase: SystemPhase;
  priority_domain: RiskDomain;
  enforcement_mode: EnforcementMode;
  constraint_level: ConstraintLevel;
}

export interface TransitionLogParams {
  userId: string;
  previous: TransitionSnapshot | null;
  current: TransitionSnapshot;
  triggerSource: TriggerSource;
  dominantRiskDomain: RiskDomain;
}

export interface TransitionLogResult {
  logged: boolean;
}

/**
 * Compare previous and current snapshots. Derive boolean change flags.
 * Exported for testing.
 */
export function computeChangeFlags(
  previous: TransitionSnapshot,
  current: TransitionSnapshot,
): {
  changed_phase: boolean;
  changed_priority: boolean;
  changed_enforcement: boolean;
  changed_budget: boolean;
} {
  return {
    changed_phase: previous.phase !== current.phase,
    changed_priority: previous.priority_domain !== current.priority_domain,
    changed_enforcement: previous.enforcement_mode !== current.enforcement_mode,
    changed_budget: previous.constraint_level !== current.constraint_level,
  };
}

/**
 * Determine triggered_by_domain: prefer new priority if changed,
 * else dominantRiskDomain, else "none".
 */
export function resolveTriggeredByDomain(
  changedPriority: boolean,
  newPriorityDomain: RiskDomain,
  dominantRiskDomain: RiskDomain,
): RiskDomain {
  if (changedPriority) return newPriorityDomain;
  if (dominantRiskDomain !== "none") return dominantRiskDomain;
  return "none";
}

/**
 * Append a system transition log row if any field changed.
 * No-op if previous is null or nothing changed.
 */
export async function appendSystemTransitionIfChanged(
  params: TransitionLogParams,
): Promise<TransitionLogResult> {
  if (!params.previous) return { logged: false };

  const flags = computeChangeFlags(params.previous, params.current);

  const anyChange =
    flags.changed_phase ||
    flags.changed_priority ||
    flags.changed_enforcement ||
    flags.changed_budget;

  if (!anyChange) return { logged: false };

  const triggered_by_domain = resolveTriggeredByDomain(
    flags.changed_priority,
    params.current.priority_domain,
    params.dominantRiskDomain,
  );

  const { error } = await safeInsert(
    "system_transition_log",
    {
      user_id: params.userId,
      previous_phase: params.previous.phase,
      new_phase: params.current.phase,
      previous_priority_domain: params.previous.priority_domain,
      new_priority_domain: params.current.priority_domain,
      previous_enforcement_mode: params.previous.enforcement_mode,
      new_enforcement_mode: params.current.enforcement_mode,
      previous_constraint_level: params.previous.constraint_level,
      new_constraint_level: params.current.constraint_level,
      trigger_source: params.triggerSource,
      triggered_by_domain,
      ...flags,
      created_at: new Date().toISOString(),
    } as Record<string, unknown>,
    supabaseAdmin,
  );

  return { logged: !error };
}
