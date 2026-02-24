export type PromoCode = {
  id: string;
  code: string;
  discount_percent: number;
  applies_to_plan: string;
  is_active: boolean;
  usage_limit: number | null;
  times_used: number;
  expires_at: string | null;
  created_at: string;
};

type PromoCodesResponse = {
  success: boolean;
  data: PromoCode[];
  error?: string;
};

type MutationResponse<TData extends object = object> = {
  success: boolean;
  data?: TData;
  error?: string;
};

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  const response = await fetch("/api/admin/promo-codes/list", { method: "GET", cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as PromoCodesResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to load promo codes.");
  }

  return json.data ?? [];
}

export async function createPromoCode(data: {
  code: string;
  discount_percent: number;
  applies_to_plan: string;
  usage_limit?: number;
  expires_at?: string;
}): Promise<PromoCode> {
  const response = await fetch("/api/admin/promo-codes/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse<PromoCode>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to create promo code.");
  }

  return json.data;
}

export async function updatePromoCode(data: {
  id: string;
  is_active?: boolean;
  usage_limit?: number;
  expires_at?: string | null;
}): Promise<PromoCode> {
  const response = await fetch("/api/admin/promo-codes/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse<PromoCode>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to update promo code.");
  }

  return json.data;
}

export async function deletePromoCode(id: string): Promise<void> {
  const response = await fetch("/api/admin/promo-codes/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to delete promo code.");
  }
}

export async function deactivatePromoCode(id: string): Promise<PromoCode> {
  const response = await fetch("/api/admin/promo-codes/deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse<PromoCode>;

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to deactivate promo code.");
  }

  return json.data;
}

