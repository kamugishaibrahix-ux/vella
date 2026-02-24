import { fuseContext } from "@/lib/ai/context/fusionEngine";
import type { EmotionalState } from "@/lib/realtime/emotion/state";
import type { HealthState } from "@/lib/realtime/health/state";
import type { ResponsePlan } from "@/lib/ai/scaffold/responseTemplate";
import type { InsightSnapshot } from "@/lib/insights/types";

export function buildRuntimeContext({
  userText,
  emotionalState,
  healthState,
  relationshipMode,
  memorySnapshot,
  musicMode,
  responsePlan,
  insights,
}: {
  userText: string;
  emotionalState: EmotionalState;
  healthState: HealthState;
  relationshipMode: string;
  memorySnapshot?: unknown;
  musicMode?: string;
  responsePlan: ResponsePlan;
  insights?: InsightSnapshot | null;
}) {
  return fuseContext({
    userText,
    emotionalState,
    healthState,
    relationshipMode,
    memorySnapshot,
    musicMode,
    responsePlan,
    insights,
  });
}

