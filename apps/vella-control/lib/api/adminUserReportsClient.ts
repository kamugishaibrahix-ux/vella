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

export async function fetchUserReports(filters?: {
  status?: string;
  severity?: string;
  user_id?: string;
}): Promise<UserReport[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.severity) params.append("severity", filters.severity);
  if (filters?.user_id) params.append("user_id", filters.user_id);

  const url = params.toString() ? `/api/admin/user-reports/list?${params}` : "/api/admin/user-reports/list";
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as UserReportsResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load user reports.");
  }

  return json.data ?? [];
}

export async function createUserReport(data: {
  user_id: string;
  type: string;
  severity: string;
  summary: string;
}): Promise<UserReport> {
  const response = await fetch("/api/admin/user-reports/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse<UserReport>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to create user report.");
  }

  return json.data;
}

export async function updateUserReport(data: {
  id: string;
  status?: string;
  assignee?: string | null;
  notes?: string | null;
}): Promise<UserReport> {
  const response = await fetch("/api/admin/user-reports/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse<UserReport>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to update user report.");
  }

  return json.data;
}

