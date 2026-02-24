"use server";

import { extractLifeThemes, type LifeTheme } from "@/lib/insights/lifeThemes";

export async function getLifeThemes(userId: string | null): Promise<LifeTheme[]> {
  if (!userId) {
    throw new Error("Life themes fetch failed");
  }
  return extractLifeThemes(userId);
}

