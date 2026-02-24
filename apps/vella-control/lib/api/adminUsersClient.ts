type UsersResponse = {
  success: boolean;
  data: AdminUserRow[];
  error?: string;
};

type MutationResponse<TData extends object = object> = {
  success: boolean;
  data?: TData;
  error?: string;
};

export type AdminUserRow = {
  user_id: string;
  plan: string;
  token_balance: number;
  token_refill_at?: string | null;
  created_at?: string;
  updated_at?: string;
  email?: string | null;
  full_name?: string | null;
  status?: string | null;
  last_active_at?: string | null;
  voice_enabled?: boolean | null;
  realtime_beta?: boolean | null;
  admin?: boolean | null;
  tokens_per_month?: number | null;
  shadow_ban?: boolean | null;
  flagged_for_review?: boolean | null;
};

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const response = await fetch("/api/admin/users/list", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as UsersResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load users.");
  }

  return json.data ?? [];
}

export async function updateUserPlan(userId: string, newPlan: string): Promise<void> {
  const response = await fetch("/api/admin/users/update-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, new_plan: newPlan }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update user plan.");
  }
}

export async function updateUserTokens(userId: string, delta: number): Promise<number> {
  const response = await fetch("/api/admin/users/update-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, delta }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse<{ token_balance: number }>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to update token balance.");
  }

  return json.data.token_balance;
}

export async function updateUserStatus(userId: string, status: string): Promise<void> {
  const response = await fetch("/api/admin/users/update-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, status }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update user status.");
  }
}

export async function updateUserVoice(userId: string, enabled: boolean): Promise<void> {
  const response = await fetch("/api/admin/users/update-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, enabled }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update voice enabled.");
  }
}

export async function updateUserRealtime(userId: string, enabled: boolean): Promise<void> {
  const response = await fetch("/api/admin/users/update-realtime", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, enabled }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update realtime beta.");
  }
}

export async function updateUserNotes(userId: string, notes: string): Promise<void> {
  const response = await fetch("/api/admin/users/update-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, notes: notes || null }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update user notes.");
  }
}

export async function updateUserShadowBan(userId: string, shadowBan: boolean): Promise<void> {
  const response = await fetch("/api/admin/users/update-shadow-ban", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, shadow_ban: shadowBan }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update shadow ban status.");
  }
}

export async function updateUserFlagged(userId: string, flagged: boolean): Promise<void> {
  const response = await fetch("/api/admin/users/update-flagged", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, flagged_for_review: flagged }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update flagged status.");
  }
}


