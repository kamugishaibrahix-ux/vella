"use server";

import { serverLocalGet } from "@/lib/local/serverLocal";

type Achievement = {
  id?: string;
  user_id: string;
  key: string;
  label?: string;
  description?: string;
  earned_at: string;
};

const ACHIEVEMENTS_KEY = (userId: string) => `achievements:${userId}`;

export async function loadAchievements(userId: string | null): Promise<Achievement[]> {
  if (!userId) return [];
  try {
    const achievements = (await serverLocalGet(ACHIEVEMENTS_KEY(userId)) ?? []) as Achievement[];
    // Sort by earned_at descending (most recent first)
    return achievements.sort((a, b) => b.earned_at.localeCompare(a.earned_at));
  } catch (error) {
    console.error("[loadAchievements] error", error);
    return [];
  }
}

