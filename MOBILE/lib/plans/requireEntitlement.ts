/**
 * Plan Entitlement Guard
 * Central enforcement layer for feature availability based on plan entitlements.
 * Backend hard gate - rejects requests even if frontend bypasses.
 * 
 * CRITICAL: Uses Feature Registry for PURE abstraction - NO tier strings allowed.
 */

import { NextResponse } from "next/server";
import { requireActiveUser, isActiveUserBlocked, type ActiveUserResult } from "@/lib/auth/requireActiveUser";
import { resolvePlanEntitlements } from "./resolvePlanEntitlements";
import type { FeatureKey } from "@/lib/tokens/costSchedule";
import type { PlanEntitlement } from "./types";
import { isFeatureEnabled } from "./featureRegistry";
import { UnknownTierError, RESTRICTED_ENTITLEMENTS } from "./defaultEntitlements";
import { logSecurityEvent } from "@/lib/telemetry/securityEvents";

export type { FeatureKey };

export interface EntitlementCheckResult {
  userId: string;
  plan: "free" | "pro" | "elite";
  entitlements: PlanEntitlement;
}

const FEATURE_NOT_AVAILABLE_RESPONSE = (feature: string, plan: string) =>
  NextResponse.json(
    {
      error: "feature_not_available",
      code: "FEATURE_NOT_AVAILABLE",
      feature,
      plan,
    },
    { status: 403 }
  );

/**
 * DEPRECATED: Local entitlement map removed.
 * 
 * Use Feature Registry (lib/plans/featureRegistry.ts) for all feature definitions.
 * The registry provides single source of truth for:
 * - featureKey → entitlementFlag mapping
 * - tokenChannel for billing
 * - uiSoftGate for UI behavior
 * 
 * All entitlement checks now use isFeatureEnabled() from featureRegistry,
 * which implements PURE abstraction (entitlements only, NO tier strings).
 */

/**
 * Require active user with valid entitlement for a feature.
 *
 * Enforcement order:
 * 1. requireActiveUser() - blocks suspended/inactive users
 * 2. resolve entitlements for returned plan
 * 3. check feature entitlement via Feature Registry (PURE abstraction - no tier strings)
 * 4. return { userId, plan, entitlements } for downstream use
 *
 * @param feature - The feature being accessed (from costSchedule FeatureKey)
 * @returns EntitlementCheckResult or NextResponse (blocked)
 */
export async function requireEntitlement(
  feature: FeatureKey
): Promise<EntitlementCheckResult | NextResponse> {
  try {
    // Step 1: Require active user (handles suspension/subscription status)
    const activeResult = await requireActiveUser();
    if (isActiveUserBlocked(activeResult)) {
      return activeResult;
    }

    const { userId, plan, subscriptionStatus } = activeResult;

    // Step 2: Resolve entitlements for the plan
    const entitlementResult = await resolvePlanEntitlements(plan);
    const { entitlements } = entitlementResult;

    // Step 3: Check feature entitlement via Feature Registry (PURE abstraction)
    const isAllowed = isFeatureEnabled(feature, entitlements);

    if (!isAllowed) {
      console.warn(`[requireEntitlement] Feature ${feature} blocked for ${plan} plan (entitlement check)`);
      return FEATURE_NOT_AVAILABLE_RESPONSE(feature, plan);
    }

    return {
      userId,
      plan,
      entitlements,
    };
  } catch (err) {
    if (err instanceof UnknownTierError) {
      logSecurityEvent("PLAN_RESOLUTION_FAILED", { tier: err.tier, context: err.context, feature });
      return NextResponse.json(
        { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
        { status: 500 }
      );
    }
    throw err;
  }
}

/**
 * Type guard: true if value is a blocked/error response from requireEntitlement.
 */
export function isEntitlementBlocked(
  value: EntitlementCheckResult | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Convenience helper for routes that need both entitlement check and token estimation.
 * Returns the standard context needed for token charging.
 */
export async function requireEntitlementWithContext(feature: FeatureKey): Promise<
  | {
      userId: string;
      plan: "free" | "pro" | "elite";
      entitlements: PlanEntitlement;
      isBlocked: false;
    }
  | { isBlocked: true; response: NextResponse }
> {
  const result = await requireEntitlement(feature);

  if (isEntitlementBlocked(result)) {
    return { isBlocked: true, response: result };
  }

  return { ...result, isBlocked: false };
}
