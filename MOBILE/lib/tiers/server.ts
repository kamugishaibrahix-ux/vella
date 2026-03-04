/**
 * Server-side plan resolution.
 * Supabase public.subscriptions.plan is the canonical source of truth.
 * Optional Redis cache (when REDIS_URL is set) reduces DB reads; cache is invalidated on webhook updates.
 *
 * HARDENING: Fails closed on infrastructure errors. Never silently falls back to "free".
 */
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { resolvePlanTier } from "./planUtils";
import type { PlanTier } from "./tierCheck";
import { getCachedPlan, setCachedPlan } from "./subscriptionPlanCache";
import { UnknownTierError } from "@/lib/plans/defaultEntitlements";
import { logSecurityEvent } from "@/lib/telemetry/securityEvents";

export { invalidateSubscriptionPlanCache } from "./subscriptionPlanCache";

export async function getUserPlanTier(userId: string): Promise<PlanTier> {
  try {
    const cached = await getCachedPlan(userId);
    if (cached !== null) return cached;

    if (!supabaseAdmin) {
      logSecurityEvent("PLAN_RESOLUTION_FAILED", { user_id: userId, reason: "supabase_admin_not_configured" });
      throw new UnknownTierError("unknown", "getUserPlanTier: Supabase admin not configured");
    }

    const { data, error } = await fromSafe("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logSecurityEvent("PLAN_LOOKUP_FAILURE", { user_id: userId, error: error.message });
      throw new UnknownTierError("unknown", `getUserPlanTier: DB query failed – ${error.message}`);
    }

    // data === null ⇒ confirmed: user has no subscription row → legitimate free tier
    // data === undefined would be impossible here (maybeSingle returns null, not undefined)
    if (data === null || data === undefined) {
      const freeTier: PlanTier = "free";
      await setCachedPlan(userId, freeTier);
      return freeTier;
    }

    const rawPlan = (data as { plan: string | null }).plan;

    // Null plan column within an existing row → ambiguous; treat as confirmed free
    if (rawPlan === null || rawPlan === undefined) {
      const freeTier: PlanTier = "free";
      await setCachedPlan(userId, freeTier);
      return freeTier;
    }

    const tier = resolvePlanTier(rawPlan);
    await setCachedPlan(userId, tier);
    return tier;
  } catch (err) {
    if (err instanceof UnknownTierError) throw err;
    logSecurityEvent("PLAN_RESOLUTION_FAILED", { user_id: userId, error: String(err) });
    throw new UnknownTierError("unknown", "getUserPlanTier: unexpected error");
  }
}
