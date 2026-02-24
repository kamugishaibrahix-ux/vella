export type UserReport = {
  id: string;
  user_id: string;
  reported_by: string | null;
  type: string;
  severity: string;
  status: string;
  summary: string;
  notes: string | null;
  assignee: string | null;
  created_at: string;
  updated_at: string;
};

type UserReportsResponse = {
  success: boolean;
  data: UserReport[];
  error?: string;
};

type MutationResponse<TData extends object = object> = {
  success: boolean;
  data?: TData;
  error?: string;
};

export async function fetchUserReports(): Promise<UserReport[]> {
  const response = await fetch("/api/admin/reports/list", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as UserReportsResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load user reports.");
  }

  return json.data ?? [];
}

export async function updateUserReport(data: {
  report_id: string;
  status?: string;
  assignee?: string | null;
  resolved_notes?: string | null;
}): Promise<UserReport> {
  const response = await fetch("/api/admin/reports/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse<UserReport>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to update report.");
  }

  return json.data;
}

