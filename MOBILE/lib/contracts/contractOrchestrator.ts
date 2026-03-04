/**
 * Contract Orchestrator — Deterministic server-side contract creation service.
 * Reads system state, applies caps/dedup, generates via engine, persists result.
 * No AI. No free text. No session auto-trigger.
 */

"use server";

import { fromSafe } from "@/lib/supabase/admin";
import type { Domain, SeverityBand } from "./contractTemplates";
import { generateContract } from "./contractEngine";
import {
  createContract,
  getActiveContracts,
  countWeeklyContracts,
  type ContractRow,
} from "./contractStoreServer";
import { getUserPlanTier } from "@/lib/tiers/server";
import { logSecurityEvent } from "@/lib/telemetry/securityEvents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractOrchestratorInput {
  userId: string;
  selectedDomains: Domain[];
  trigger: "manual" | "session_close" | "scheduler_tick";
}

export interface ContractOrchestratorResult {
  created: number;
  skipped: number;
  reasonCodes: string[];
  createdContracts: Array<{ id: string; template_id: string; domain: Domain }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_DOMAINS: readonly string[] = [
  "health", "finance", "cognitive", "performance",
  "recovery", "addiction", "relationships", "identity",
];

const TIER_WEEKLY_CAP: Record<string, number> = {
  free: 1,
  pro: 3,
  elite: 5,
};

const DEDUPE_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

const DEFAULT_BUDGET_WEIGHT: Record<string, number> = {
  observe: 0,
  soft: 3,
  strict: 5,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveSeverity(urgencyLevel: number): SeverityBand {
  if (urgencyLevel >= 80) return "high";
  if (urgencyLevel >= 50) return "moderate";
  return "low";
}

function isDomainValid(value: string): value is Domain {
  return ALL_DOMAINS.includes(value);
}

function isDuplicate(
  activeContracts: ContractRow[],
  templateId: string,
  domain: string,
  severity: string,
  now: number,
): boolean {
  for (const c of activeContracts) {
    const createdAt = new Date(c.created_at).getTime();
    if (now - createdAt > DEDUPE_WINDOW_MS) continue;

    if (c.template_id === templateId) return true;
    if (c.domain === domain && c.severity === severity) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runContractOrchestrator(
  input: ContractOrchestratorInput,
): Promise<ContractOrchestratorResult> {
  const { userId, selectedDomains } = input;
  const reasonCodes: string[] = [];

  const skip = (reason: string): ContractOrchestratorResult => ({
    created: 0,
    skipped: 1,
    reasonCodes: [reason],
    createdContracts: [],
  });

  // ── A) Read system_status_current ───────────────────────────────────────
  let systemStatus: {
    top_priority_domain: string;
    urgency_level: number;
    enforcement_mode: string;
    updated_at: string;
  } | null = null;

  try {
    const { data, error } = await fromSafe("system_status_current")
      .select("top_priority_domain, urgency_level, enforcement_mode, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return skip("MISSING_SYSTEM_STATUS");
    }
    systemStatus = data as typeof systemStatus;
  } catch {
    return skip("MISSING_SYSTEM_STATUS");
  }

  // ── B) Read resource_budget_current (optional — conservative defaults) ──
  let budgetWeightAvailable: number;
  try {
    const { data } = await fromSafe("resource_budget_current")
      .select("max_focus_minutes_today, recovery_required_hours")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      const typed = data as { max_focus_minutes_today: number; recovery_required_hours: number };
      const focusFraction = Math.min(typed.max_focus_minutes_today / 180, 1);
      const recoveryPenalty = typed.recovery_required_hours > 4 ? 2 : 0;
      budgetWeightAvailable = Math.max(1, Math.round(focusFraction * 5) - recoveryPenalty);
    } else {
      budgetWeightAvailable = DEFAULT_BUDGET_WEIGHT[systemStatus!.enforcement_mode] ?? 3;
    }
  } catch {
    budgetWeightAvailable = DEFAULT_BUDGET_WEIGHT[systemStatus!.enforcement_mode] ?? 3;
  }

  // ── C) Resolve tier — fail closed, never coerce to free ──────────────
  let userTier: "free" | "pro" | "elite";
  try {
    userTier = await getUserPlanTier(userId);
  } catch {
    logSecurityEvent("CONTRACT_PLAN_RESOLUTION_FAILED", { user_id: userId });
    return skip("PLAN_RESOLUTION_FAILED");
  }

  // ── D) Weekly count ─────────────────────────────────────────────────────
  const { count: weeklyCount } = await countWeeklyContracts(userId);

  // ── E) Active contracts (for dedupe) ────────────────────────────────────
  const { data: activeContracts } = await getActiveContracts(userId);

  // ── Enforcement mode guard ──────────────────────────────────────────────
  const enforcementMode = systemStatus!.enforcement_mode as "observe" | "soft" | "strict";
  if (enforcementMode === "observe") {
    return skip("OBSERVE_MODE");
  }

  // ── Domain resolution ───────────────────────────────────────────────────
  let targetDomain: Domain;
  const topPriority = systemStatus!.top_priority_domain;

  if (isDomainValid(topPriority) && selectedDomains.includes(topPriority)) {
    targetDomain = topPriority;
  } else if (selectedDomains.length > 0) {
    targetDomain = selectedDomains[0];
  } else {
    return skip("NO_SELECTED_DOMAINS");
  }

  // ── Severity derivation ─────────────────────────────────────────────────
  const severity = deriveSeverity(systemStatus!.urgency_level);

  // ── Weekly cap ──────────────────────────────────────────────────────────
  const weeklyCap = TIER_WEEKLY_CAP[userTier] ?? 1;
  const remainingSlots = Math.max(0, weeklyCap - weeklyCount);
  if (remainingSlots <= 0) {
    return skip("WEEKLY_CAP_REACHED");
  }

  // ── Dedupe ──────────────────────────────────────────────────────────────
  const generated = generateContract({
    domain: targetDomain,
    severity,
    enforcementMode,
    selectedDomains,
    availableWeeklySlots: remainingSlots,
    resourceBudgetWeightAvailable: budgetWeightAvailable,
    userTier,
  });

  if (!generated) {
    return skip("NO_ELIGIBLE_TEMPLATE");
  }

  if (isDuplicate(activeContracts, generated.templateId, generated.domain, generated.intensity, Date.now())) {
    return skip("DUPLICATE_ACTIVE_CONTRACT");
  }

  // ── Persist ─────────────────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + generated.durationDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: inserted, error: insertError } = await createContract({
    user_id: userId,
    template_id: generated.templateId,
    domain: generated.domain,
    origin: "system",
    enforcement_mode: enforcementMode,
    severity: generated.intensity,
    duration_days: generated.durationDays,
    budget_weight: generated.budgetWeight,
    expires_at: expiresAt,
  });

  if (insertError || !inserted) {
    return skip("PERSIST_FAILED");
  }

  return {
    created: 1,
    skipped: 0,
    reasonCodes,
    createdContracts: [
      {
        id: inserted.id,
        template_id: inserted.template_id,
        domain: inserted.domain as Domain,
      },
    ],
  };
}
