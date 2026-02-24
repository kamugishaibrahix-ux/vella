"use server";

import { serverLocalGet } from "@/lib/local/serverLocal";

export async function loadConnectionDepth(userId: string | null): Promise<number> {
  if (!userId) return 0;
  try {
    const data = await serverLocalGet(`connection_depth:${userId}`);
    const row = data as { depth_score?: number } | null;
    const score = row?.depth_score ?? 0;
    return typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  } catch (error) {
    console.error("[loadConnectionDepth] error", error);
    return 0;
  }
}

