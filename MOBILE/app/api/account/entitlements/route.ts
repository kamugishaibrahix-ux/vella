/**
 * GET /api/account/entitlements
 * Returns current user's plan entitlements.
 * Backend is authoritative - frontend uses this for soft gating.
 *
 * HARDENING: Returns RESTRICTED entitlements on error, never free defaults.
 */

import { NextResponse } from "next/server";
import { requireActiveUser, isActiveUserBlocked } from "@/lib/auth/requireActiveUser";
import { resolvePlanEntitlements } from "@/lib/plans/resolvePlanEntitlements";
import { safeErrorLog } from "@/lib/security/logGuard";
import { RESTRICTED_ENTITLEMENTS, UnknownTierError } from "@/lib/plans/defaultEntitlements";

const RESTRICTED_DEFAULTS = {
  plan: "free" as const,
  entitlements: RESTRICTED_ENTITLEMENTS,
  source: "fail_closed",
};

export async function GET() {
  try {
    const activeResult = await requireActiveUser();
    if (isActiveUserBlocked(activeResult)) {
      return activeResult;
    }

    const { plan } = activeResult;

    const entitlementResult = await resolvePlanEntitlements(plan);

    return NextResponse.json({
      plan: entitlementResult.plan,
      entitlements: entitlementResult.entitlements,
      source: entitlementResult.source,
    });
  } catch (error) {
    if (error instanceof UnknownTierError) {
      safeErrorLog("[api/account/entitlements] UnknownTierError – returning RESTRICTED", error);
      return NextResponse.json(RESTRICTED_DEFAULTS, { status: 500 });
    }
    safeErrorLog("[api/account/entitlements] Error – returning RESTRICTED defaults", error);
    return NextResponse.json(RESTRICTED_DEFAULTS, { status: 500 });
  }
}
