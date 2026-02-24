import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/supabase/server-auth";
import { getUserPlanTier } from "@/lib/tiers/server";

export type AccountPlanResponse = {
  plan: "free" | "pro" | "elite";
};

/**
 * GET /api/account/plan
 * Returns the authenticated user's plan tier from backend (subscriptions).
 */
export async function GET() {
  const userIdOr401 = await requireUserId();
  if (userIdOr401 instanceof Response) return userIdOr401;
  const userId = userIdOr401;

  const plan = await getUserPlanTier(userId).catch(() => "free" as const);
  const body: AccountPlanResponse = { plan };
  return NextResponse.json(body);
}
