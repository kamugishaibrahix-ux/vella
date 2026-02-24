import type { EmotionalState } from "@/lib/realtime/emotion/state";
import type { HealthState } from "@/lib/realtime/health/state";
import type { ResponsePlan } from "@/lib/ai/scaffold/responseTemplate";
import type { InsightSnapshot } from "@/lib/insights/types";

export interface ContextBundle {
  userText: string;
  relationshipMode: string;
  emotionalState: EmotionalState;
  healthState: HealthState;
  memorySnapshot?: unknown;
  musicMode?: string;
  responsePlan: ResponsePlan;
  insights?: InsightSnapshot | null;
}

