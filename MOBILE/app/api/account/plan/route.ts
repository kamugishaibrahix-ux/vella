import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { getUserPlanTier } from "@/lib/tiers/server";
import { UnknownTierError } from "@/lib/plans/defaultEntitlements";
import { logSecurityEvent } from "@/lib/telemetry/securityEvents";

export type AccountPlanResponse = {
  plan: "free" | "pro" | "elite";
};

export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  try {
    const plan = await getUserPlanTier(userId);
    const body: AccountPlanResponse = { plan };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof UnknownTierError) {
      logSecurityEvent("PLAN_RESOLUTION_FAILED", { user_id: userId, tier: err.tier, context: err.context });
      return NextResponse.json(
        { error: "plan_resolution_failed", code: "PLAN_RESOLUTION_FAILED" },
        { status: 500 }
      );
    }
    throw err;
  }
}
