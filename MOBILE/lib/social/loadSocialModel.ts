"use server";

import { serverLocalGet } from "@/lib/local/serverLocal";

export async function loadSocialModel(userId: string | null): Promise<Record<string, unknown>> {
  if (!userId) return {};
  try {
    const data = await serverLocalGet(`social_models:${userId}`);
    const row = data as { model?: Record<string, unknown> } | null;
    return (row?.model as Record<string, unknown>) ?? {};
  } catch (error) {
    console.error("[loadSocialModel] error", error);
    return {};
  }
}

