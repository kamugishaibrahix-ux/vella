/**
 * Plan Entitlements Resolver
 * Canonical resolver that pulls plan definitions from admin_ai_config
 * and merges with safe defaults.
 *
 * FAIL-SAFE DESIGN:
 * - Never throws
 * - Field-level fallback (invalid field uses default, rest uses admin)
 * - Always returns fully populated PlanEntitlement
 * - Logs fallback events for observability
 */

import type { PlanTier, PlanEntitlement, ResolvedPlanEntitlements } from "./types";
import {
  getDefaultEntitlements,
  getDefaultEntitlementsSafe,
  isValidPlanTier,
  UnknownTierError,
  RESTRICTED_ENTITLEMENTS,
} from "./defaultEntitlements";
import { loadActiveAdminAIConfig } from "@/lib/admin/adminConfig";

/**
 * Validates that a value is a non-negative number.
 */
function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Validates that a value is a boolean.
 */
function isValidBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Business sanity upper bounds for entitlement values.
 * Hard clamps to prevent accidental misconfiguration.
 */
const BUSINESS_LIMITS = {
  maxMonthlyTokens: { min: 0, max: 10_000_000 },
  requestsPerMinute: { min: 1, max: 600 },
} as const;

/**
 * Validates and clamps a single entitlement field.
 * Returns the validated value or the default if invalid.
 * Applies business sanity upper bounds (hard clamps).
 */
function validateNumberField(
  value: unknown,
  defaultValue: number,
  fieldName: string,
  plan: PlanTier
): number {
  if (!isValidNumber(value)) {
    console.warn(`[resolvePlanEntitlements] Invalid number for ${plan}.${fieldName}, using default: ${defaultValue}`);
    return defaultValue;
  }

  // Apply business sanity clamps for specific fields
  if (fieldName === "maxMonthlyTokens") {
    const clamped = Math.max(BUSINESS_LIMITS.maxMonthlyTokens.min, Math.min(BUSINESS_LIMITS.maxMonthlyTokens.max, value));
    if (clamped !== value) {
      console.warn(`[resolvePlanEntitlements] Clamped ${plan}.${fieldName} from ${value} to ${clamped} (business limits: ${BUSINESS_LIMITS.maxMonthlyTokens.min}..${BUSINESS_LIMITS.maxMonthlyTokens.max})`);
    }
    return clamped;
  }

  if (fieldName === "requestsPerMinute") {
    const clamped = Math.max(BUSINESS_LIMITS.requestsPerMinute.min, Math.min(BUSINESS_LIMITS.requestsPerMinute.max, value));
    if (clamped !== value) {
      console.warn(`[resolvePlanEntitlements] Clamped ${plan}.${fieldName} from ${value} to ${clamped} (business limits: ${BUSINESS_LIMITS.requestsPerMinute.min}..${BUSINESS_LIMITS.requestsPerMinute.max})`);
    }
    return clamped;
  }

  return value;
}

/**
 * Validates a boolean field.
 * Returns the validated value or the default if invalid.
 */
function validateBooleanField(
  value: unknown,
  defaultValue: boolean,
  fieldName: string,
  plan: PlanTier
): boolean {
  if (!isValidBoolean(value)) {
    console.warn(`[resolvePlanEntitlements] Invalid boolean for ${plan}.${fieldName}, using default: ${defaultValue}`);
    return defaultValue;
  }
  return value;
}

/**
 * Merges admin-provided entitlements with defaults.
 * Field-level validation: each field validated separately.
 * Invalid fields fall back to defaults, valid fields use admin config.
 */
function mergeEntitlements(
  plan: PlanTier,
  adminEntitlements: Partial<PlanEntitlement> | undefined,
  defaults: PlanEntitlement
): PlanEntitlement {
  // If no admin entitlements at all, return defaults
  if (!adminEntitlements || typeof adminEntitlements !== "object") {
    return { ...defaults };
  }

  return {
    maxMonthlyTokens: validateNumberField(
      adminEntitlements.maxMonthlyTokens,
      defaults.maxMonthlyTokens,
      "maxMonthlyTokens",
      plan
    ),

    // Structural booleans — always use defaults (not admin-configurable)
    isPaid: defaults.isPaid,
    usesAllocationBucket: defaults.usesAllocationBucket,

    enableRealtime: validateBooleanField(
      adminEntitlements.enableRealtime,
      defaults.enableRealtime,
      "enableRealtime",
      plan
    ),
    enableVoiceTTS: validateBooleanField(
      adminEntitlements.enableVoiceTTS,
      defaults.enableVoiceTTS,
      "enableVoiceTTS",
      plan
    ),
    enableAudioVella: validateBooleanField(
      adminEntitlements.enableAudioVella,
      defaults.enableAudioVella,
      "enableAudioVella",
      plan
    ),
    enableArchitect: validateBooleanField(
      adminEntitlements.enableArchitect,
      defaults.enableArchitect,
      "enableArchitect",
      plan
    ),
    enableDeepDive: validateBooleanField(
      adminEntitlements.enableDeepDive,
      defaults.enableDeepDive,
      "enableDeepDive",
      plan
    ),
    enableDeepInsights: validateBooleanField(
      adminEntitlements.enableDeepInsights,
      defaults.enableDeepInsights,
      "enableDeepInsights",
      plan
    ),
    enableGrowthRoadmap: validateBooleanField(
      adminEntitlements.enableGrowthRoadmap,
      defaults.enableGrowthRoadmap,
      "enableGrowthRoadmap",
      plan
    ),

    enableDeepMemory: validateBooleanField(
      adminEntitlements.enableDeepMemory,
      defaults.enableDeepMemory,
      "enableDeepMemory",
      plan
    ),

    // Rate limiting - optional, validate if present
    requestsPerMinute: adminEntitlements.requestsPerMinute !== undefined
      ? validateNumberField(
          adminEntitlements.requestsPerMinute,
          defaults.requestsPerMinute ?? 5,
          "requestsPerMinute",
          plan
        )
      : defaults.requestsPerMinute,
  };
}

/**
 * Resolves entitlements for a specific plan tier.
 *
 * Behavior:
 * 1. Fetches admin config via existing loader
 * 2. If planEntitlements exists and is valid → uses it (field-level validation)
 * 3. If missing or invalid at root level → falls back to defaults
 * 4. Always returns fully populated PlanEntitlement
 * 5. Never throws
 *
 * @param plan - The plan tier to resolve entitlements for
 * @returns ResolvedPlanEntitlements with plan, entitlements, and source
 */
export async function resolvePlanEntitlements(plan: PlanTier): Promise<ResolvedPlanEntitlements> {
  try {
    // HARDENING: Validate tier before proceeding – fail closed on corruption
    const validatedTier = isValidPlanTier(plan) ? plan : null;
    if (!validatedTier) {
      throw new UnknownTierError(String(plan), "resolvePlanEntitlements");
    }

    // Load admin config (never throws)
    const adminConfig = await loadActiveAdminAIConfig();

    // Get defaults as fallback base (safe: tier is validated above)
    const defaults = getDefaultEntitlements(validatedTier);

    // Resolve entitlements root: try planEntitlements, plan_entitlements, plans
    const entitlementsRoot =
      (adminConfig?.planEntitlements as Record<string, PlanEntitlement> | undefined) ??
      ((adminConfig as Record<string, unknown>)?.plan_entitlements as Record<string, PlanEntitlement> | undefined) ??
      ((adminConfig as Record<string, unknown>)?.plans as Record<string, PlanEntitlement> | undefined) ??
      null;

    // Normalise plan key
    const planKeyNorm = String(plan ?? "free").toLowerCase();

    // Try to find entitlements with normalised key, then original key
    const resolvedPlan =
      entitlementsRoot?.[planKeyNorm] ??
      entitlementsRoot?.[plan] ??
      null;

    if (!resolvedPlan || typeof resolvedPlan !== "object") {
      console.warn(
        `[resolvePlanEntitlements] Missing plan in admin config`,
        {
          planKey: plan,
          planKeyNorm,
          availablePlans: entitlementsRoot
            ? Object.keys(entitlementsRoot)
            : null,
        }
      );
      return {
        plan,
        entitlements: { ...defaults },
        source: "defaults",
      };
    }

    // Admin has config for this plan - merge with field-level validation
    const merged = mergeEntitlements(plan, resolvedPlan, defaults);

    console.log(`[resolvePlanEntitlements] Resolved ${plan} entitlements from admin config`);

    return {
      plan,
      entitlements: merged,
      source: "admin",
    };
  } catch (error) {
    // HARDENING: Fail-closed – return RESTRICTED entitlements, not free defaults
    if (error instanceof UnknownTierError) {
      console.error("[resolvePlanEntitlements] Unknown tier – returning RESTRICTED entitlements:", {
        tier: error.tier,
        context: error.context,
      });
    } else {
      console.error("[resolvePlanEntitlements] Unexpected error – returning RESTRICTED entitlements:", error);
    }
    return {
      plan: isValidPlanTier(plan) ? plan : "free",
      entitlements: { ...RESTRICTED_ENTITLEMENTS },
      source: "defaults",
    };
  }
}

/**
 * Synchronous version that returns defaults only.
 * Useful for server-side paths where async is not available.
 */
export function resolvePlanEntitlementsSync(plan: PlanTier): ResolvedPlanEntitlements {
  if (!isValidPlanTier(plan)) {
    console.error("[resolvePlanEntitlementsSync] Invalid tier – returning RESTRICTED:", plan);
    return {
      plan: "free",
      entitlements: { ...RESTRICTED_ENTITLEMENTS },
      source: "defaults",
    };
  }
  const defaults = getDefaultEntitlements(plan);
  return {
    plan,
    entitlements: { ...defaults },
    source: "defaults",
  };
}

/**
 * Batch resolver for all three tiers.
 * Efficiently loads admin config once and resolves all three.
 */
export async function resolveAllPlanEntitlements(): Promise<{
  free: ResolvedPlanEntitlements;
  pro: ResolvedPlanEntitlements;
  elite: ResolvedPlanEntitlements;
}> {
  try {
    const adminConfig = await loadActiveAdminAIConfig();
    const adminEntitlementsRoot = adminConfig.planEntitlements;
    const hasAdminConfig = !!(
      adminEntitlementsRoot &&
      typeof adminEntitlementsRoot === "object" &&
      ("free" in adminEntitlementsRoot || "pro" in adminEntitlementsRoot || "elite" in adminEntitlementsRoot)
    );

    const source = hasAdminConfig ? "admin" : "defaults";

    return {
      free: await resolvePlanEntitlements("free"),
      pro: await resolvePlanEntitlements("pro"),
      elite: await resolvePlanEntitlements("elite"),
    };
  } catch (error) {
    // Fail-safe: return all defaults
    console.error("[resolveAllPlanEntitlements] Error, returning all defaults:", error);
    return {
      free: resolvePlanEntitlementsSync("free"),
      pro: resolvePlanEntitlementsSync("pro"),
      elite: resolvePlanEntitlementsSync("elite"),
    };
  }
}
