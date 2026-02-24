/**
 * Server-side plan resolution.
 * Supabase public.subscriptions.plan is the canonical source of truth.
 * Optional Redis cache (when REDIS_URL is set) reduces DB reads; cache is invalidated on webhook updates.
 */
import { supabaseAdmin, fromSafe } from "@/lib/supabase/admin";
import { resolvePlanTier } from "./planUtils";
import type { PlanTier } from "./tierCheck";
import { getCachedPlan, setCachedPlan } from "./subscriptionPlanCache";

export { invalidateSubscriptionPlanCache } from "./subscriptionPlanCache";

export async function getUserPlanTier(userId: string): Promise<PlanTier> {
  try {
    // Optional: read from Redis cache first (60s TTL)
    const cached = await getCachedPlan(userId);
    if (cached !== null) return cached;

    // No Supabase admin client -> cannot perform DB check; log and fallback
    if (!supabaseAdmin) {
      console.error("[tiers] Supabase admin not configured; cannot resolve plan from DB.");
      return "free";
    }

    const { data, error } = await fromSafe("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[tiers] getUserPlanTier Supabase error", error.message);
      return "free";
    }

    // No row -> user has no subscription record; default to free
    if (!data) {
      await setCachedPlan(userId, "free");
      return "free";
    }

    const plan = (data as { plan: string | null }).plan;
    const tier = resolvePlanTier(plan ?? "free");
    await setCachedPlan(userId, tier);
    return tier;
  } catch (err) {
    console.error("[tiers] getUserPlanTier error", err);
    return "free";
  }
}
