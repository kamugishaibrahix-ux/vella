"use server";

import { serverLocalGet, serverLocalSet } from "@/lib/local/serverLocal";

export async function loadCache(userId: string | null): Promise<unknown | null> {
  if (!userId) return null;
  try {
    const data = await serverLocalGet(`micro_rag_cache:${userId}`);
    const row = data as { data?: unknown } | null;
    return row?.data ?? null;
  } catch (error) {
    console.error("[loadCache] error", error);
    return null;
  }
}

export async function saveCache(userId: string, data: unknown) {
  if (!userId) return;
  try {
    await serverLocalSet(`micro_rag_cache:${userId}`, {
      user_id: userId,
      data,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[saveCache] error", error);
    throw error;
  }
}

