import type { AdminFeedbackRow } from "@/app/api/admin/feedback/list/route";

type FeedbackResponse = {
  success: boolean;
  data: AdminFeedbackRow[];
  error?: string;
};

export async function fetchAdminFeedback(): Promise<AdminFeedbackRow[]> {
  const response = await fetch("/api/admin/feedback/list", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as FeedbackResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load feedback.");
  }

  return json.data ?? [];
}

