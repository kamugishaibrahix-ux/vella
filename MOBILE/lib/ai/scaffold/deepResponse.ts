import type { ResponsePlan } from "./responseTemplate";

export function buildDeepResponse(plan: ResponsePlan): string {
  return [...plan.narrativeFlow].join(" ").trim();
}

