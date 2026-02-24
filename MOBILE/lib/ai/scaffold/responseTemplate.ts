export interface ResponsePlan {
  intent: string;
  emotionalGoal: string;
  keyPoints: string[];
  narrativeFlow: string[];
}

export function buildResponsePlan(_context?: unknown): ResponsePlan {
  return {
    intent: "",
    emotionalGoal: "",
    keyPoints: [],
    narrativeFlow: [],
  };
}

