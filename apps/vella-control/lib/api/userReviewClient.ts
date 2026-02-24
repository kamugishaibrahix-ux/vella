type MutationResponse = {
  success: boolean;
  error?: string;
};

export async function flagUserForReview(userId: string, flagged: boolean): Promise<void> {
  const response = await fetch("/api/admin/users/flag-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, flagged }),
  });

  const json = (await response.json().catch(() => ({}))) as MutationResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "Failed to update flag status.");
  }
}

