export type AdminLogEntry = {
  id: string;
  type?: string | null;
  message?: string | null;
  action?: string | null;
  previous?: unknown;
  next?: unknown;
  created_at: string;
  source: "system_logs" | "admin_activity_log";
};

type LogsResponse = {
  success: boolean;
  data: AdminLogEntry[];
  error?: string;
};

export async function fetchAdminLogs(queryString?: string): Promise<AdminLogEntry[]> {
  const url = queryString ? `/api/admin/logs/list?${queryString}` : "/api/admin/logs/list";
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as LogsResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load logs.");
  }

  return json.data ?? [];
}


