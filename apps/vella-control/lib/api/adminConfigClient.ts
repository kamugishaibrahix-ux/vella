import { AdminConfig } from "@/lib/types/adminConfig";

type ConfigResponse = {
  success: boolean;
  data: AdminConfig | null;
  error?: string;
};

type SaveResponse = {
  success: boolean;
  error?: string;
};

export async function fetchAdminConfig(): Promise<AdminConfig | null> {
  const response = await fetch("/api/admin/config/get", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as ConfigResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load admin configuration.");
  }

  return json.data ?? null;
}

export async function saveAdminConfig(config: AdminConfig): Promise<void> {
  const response = await fetch("/api/admin/config/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });

  const json = (await response.json().catch(() => ({}))) as SaveResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to save admin configuration.");
  }
}


