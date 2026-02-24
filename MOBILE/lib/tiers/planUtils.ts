import type { PlanTier } from "./tierCheck";

export type { PlanTier };

// Plan tiers are unified: "free" | "pro" | "elite". Supabase subscriptions.plan is the source of truth.

export function resolvePlanTier(planName?: string | null): PlanTier {
  if (!planName) return "free";
  const normalized = planName.trim().toLowerCase();
  if (normalized === "elite") return "elite";
  if (normalized === "pro") return "pro";
  return "free";
}

