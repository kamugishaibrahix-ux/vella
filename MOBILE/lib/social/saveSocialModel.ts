"use server";

import { serverLocalSet } from "@/lib/local/serverLocal";

export async function saveSocialModel(userId: string, model: unknown) {
  if (!userId) return;
  try {
    await serverLocalSet(`social_models:${userId}`, {
      user_id: userId,
      model,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[saveSocialModel] error", error);
  }
}

