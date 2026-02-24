export type AdminSubscription = {
  id: string;
  user_id: string;
  status: string;
  plan: string;
  renews_at?: string | null;
  cancel_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type SubscriptionsResponse = {
  success: boolean;
  data: AdminSubscription[];
  error?: string;
};

export async function fetchAdminSubscriptions(): Promise<AdminSubscription[]> {
  const response = await fetch("/api/admin/subscriptions/list", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as SubscriptionsResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load subscriptions.");
  }

  return json.data ?? [];
}

type MutationResponse<TData extends object = object> = {
  success: boolean;
  data?: TData;
  error?: string;
};

export async function updateSubscriptionPlan(
  subscriptionId: string,
  plan: string,
): Promise<void> {
  const response = await fetch("/api/admin/subscriptions/update-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription_id: subscriptionId, plan }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update subscription plan.");
  }
}

export async function updateSubscriptionStatus(
  subscriptionId: string,
  status: "active" | "canceled" | "cancelled" | "past_due" | "trialing" | "paused",
): Promise<void> {
  const response = await fetch("/api/admin/subscriptions/update-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription_id: subscriptionId, status }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update subscription status.");
  }
}


