export type Alert = {
  id: string;
  title: string;
  details: string;
  severity: "info" | "warning" | "error";
  source: string;
  timestamp: string;
};

type AlertsResponse = {
  success: boolean;
  data: Alert[];
  error?: string;
};

export async function fetchAlerts(): Promise<Alert[]> {
  const response = await fetch("/api/admin/alerts", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as AlertsResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load alerts.");
  }

  return json.data ?? [];
}

