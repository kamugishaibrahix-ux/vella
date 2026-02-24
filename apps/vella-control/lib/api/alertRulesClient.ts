export type AlertRule = {
  id: string;
  pattern: string;
  severity: "info" | "warning" | "error";
  enabled: boolean;
};

type AlertRulesResponse = {
  success: boolean;
  data: AlertRule[];
  error?: string;
};

type MutationResponse = {
  success: boolean;
  message?: string;
  error?: string;
};

export async function fetchAlertRules(): Promise<AlertRule[]> {
  const response = await fetch("/api/admin/alert-rules", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as AlertRulesResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load alert rules.");
  }

  return (json.data ?? []) as AlertRule[];
}

export async function saveAlertRules(rules: AlertRule[]): Promise<void> {
  const response = await fetch("/api/admin/alert-rules/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to save alert rules.");
  }
}

