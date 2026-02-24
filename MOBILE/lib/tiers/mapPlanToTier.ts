import type { PlanTier } from "./tierCheck";
import { resolvePlanTier } from "./planUtils";

export function mapPlanToTier(planName?: string | null): PlanTier {
  return resolvePlanTier(planName);
}

