export type SystemHealth = {
  error_count_24h: number;
  info_count_24h: number;
  db_load: number | null;
  status: "operational" | "degraded";
};

type SystemHealthResponse = {
  success: boolean;
  data: SystemHealth;
  error?: string;
};

export async function fetchSystemHealth(): Promise<SystemHealth> {
  const response = await fetch("/api/admin/system-health", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as SystemHealthResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load system health.");
  }

  return json.data;
}

