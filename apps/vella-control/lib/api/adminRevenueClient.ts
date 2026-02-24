export type RevenueData = {
  mrr: number;
  plan_totals: Record<string, { count: number; mrr: number }>;
};

type RevenueResponse = {
  success: boolean;
  data: RevenueData;
  error?: string;
};

export async function fetchRevenue(): Promise<RevenueData> {
  const response = await fetch("/api/admin/revenue", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as RevenueResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load revenue data.");
  }

  return json.data;
}

