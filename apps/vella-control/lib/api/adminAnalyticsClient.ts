export type AdminAnalytics = Record<string, number>;

type AnalyticsResponse = {
  success: boolean;
  data: AdminAnalytics;
  error?: string;
};

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const response = await fetch("/api/admin/analytics/get", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as AnalyticsResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load analytics.");
  }

  return json.data ?? {};
}


