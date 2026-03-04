import type { PlanTier } from "./tierCheck";
import { UnknownTierError, isValidPlanTier } from "@/lib/plans/defaultEntitlements";
import { logSecurityEvent } from "@/lib/telemetry/securityEvents";

export type { PlanTier };

/**
 * Legacy alias coercion is disabled by default.
 * If a migration requires it, enable temporarily and redeploy.
 * MUST remain false in production to prevent silent tier mutation.
 */
const ALLOW_LEGACY_PLAN_ALIASES = false;

const LEGACY_ALIASES: Record<string, PlanTier> = {
  basic: "free",
  premium: "elite",
};

/**
 * Resolve a raw plan string to a canonical PlanTier.
 *
 * HARDENING v2:
 * - Null/undefined → "free" (confirmed: user has no subscription).
 * - Valid tier → returned as-is.
 * - Legacy alias → blocked unless ALLOW_LEGACY_PLAN_ALIASES is true.
 * - Unknown string → throws UnknownTierError (data corruption).
 */
export function resolvePlanTier(planName?: string | null): PlanTier {
  if (!planName) return "free";
  const normalized = planName.trim().toLowerCase();

  if (isValidPlanTier(normalized)) return normalized;

  const aliasTarget = LEGACY_ALIASES[normalized];
  if (aliasTarget) {
    if (ALLOW_LEGACY_PLAN_ALIASES) {
      console.warn("[LEGACY_TIER_ALIAS_MAPPED]", { rawPlan: planName, resolvedTo: aliasTarget });
      return aliasTarget;
    }
    logSecurityEvent("LEGACY_TIER_ALIAS_BLOCKED", { rawPlan: planName });
    throw new UnknownTierError(planName, "resolvePlanTier: legacy alias blocked");
  }

  throw new UnknownTierError(planName, "resolvePlanTier");
}

