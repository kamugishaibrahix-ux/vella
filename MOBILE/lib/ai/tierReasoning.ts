/**
 * @deprecated Use lib/plans/capabilities.ts instead.
 *
 * HARDENING: The tier-string shim has been removed.
 * Callers MUST pass capabilities; no tier-string fallback.
 */

import type { Capabilities } from "@/lib/plans/capabilities";
import { injectCapabilityReasoning, getCapabilities } from "@/lib/plans/capabilities";
import { getDefaultEntitlements, isValidPlanTier } from "@/lib/plans/defaultEntitlements";

/**
 * @deprecated Use injectCapabilityReasoning(getCapabilities(entitlements)) directly.
 *
 * If capabilities are provided, uses them. Otherwise resolves from entitlements
 * using the entitlement-based path (no tier-string logic).
 */
export function injectTierReasoning(
  tier: "free" | "pro" | "elite" | string,
  capabilities?: Capabilities
): string {
  if (capabilities) {
    return injectCapabilityReasoning(capabilities);
  }

  if (!isValidPlanTier(tier)) {
    return injectCapabilityReasoning(getCapabilities(getDefaultEntitlements("free")));
  }

  const entitlements = getDefaultEntitlements(tier);
  return injectCapabilityReasoning(getCapabilities(entitlements));
}
