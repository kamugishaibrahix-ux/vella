export type EngagementData = {
  chart: Array<{
    date: string;
    tokens: number;
    feedback: number;
    sessions: number;
  }>;
  summary: {
    total_tokens: number;
    total_feedback: number;
    estimated_sessions: number;
  };
};

type EngagementResponse = {
  success: boolean;
  data: EngagementData;
  error?: string;
};

export async function fetchEngagement(): Promise<EngagementData> {
  const response = await fetch("/api/admin/engagement", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as EngagementResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load engagement data.");
  }

  return json.data;
}

