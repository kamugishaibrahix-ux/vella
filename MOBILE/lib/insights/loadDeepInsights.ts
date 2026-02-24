// Deprecated: Deep insights now stored locally only
export type DeepInsightsBundle = {
  insights?: Array<{ id?: string; title?: string | null; summary?: string | null }>;
};

export async function loadLatestDeepInsights(_userId?: string): Promise<DeepInsightsBundle | null> {
  return null;
}

